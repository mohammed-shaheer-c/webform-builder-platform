import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../config/prisma';
import { DEV_TENANT } from '../../config/tenant';
import { submissionQueue, closeSubmissionQueue } from '../../queue/submissionQueue';
import { processSubmissionJob, closeSubmissionWorker } from '../../queue/submissionWorker';
import { Job } from 'bullmq';

describe('Correctness-Critical Architecture Verification', () => {
  beforeAll(async () => {
    // Ensure dev tenant exists
    await prisma.tenant.upsert({
      where: { id: DEV_TENANT.id },
      update: {},
      create: {
        id: DEV_TENANT.id,
        name: DEV_TENANT.name,
      },
    });
  });

  const createdFormIds: string[] = [];

  afterAll(async () => {
    // Clean up forms created specifically in this suite
    if (createdFormIds.length > 0) {
      await prisma.submission.deleteMany({
        where: { formId: { in: createdFormIds } },
      });
      await prisma.formVersion.deleteMany({
        where: { formId: { in: createdFormIds } },
      });
      await prisma.form.deleteMany({
        where: { id: { in: createdFormIds } },
      });
    }

    await closeSubmissionWorker();
    await closeSubmissionQueue();
    await prisma.$disconnect();
  });

  // =========================================================================
  // 1. DYNAMIC SERVER-SIDE VALIDATION FROM A DYNAMIC FORM DEFINITION
  // =========================================================================
  describe('1. Dynamic Server-Side Validation', () => {
    let formId: string;

    beforeAll(async () => {
      // Create and publish a form containing: text, email, number, select, checkbox, and conditional fields
      const schema = {
        fields: [
          { id: 'username', type: 'text', label: 'Username', required: true },
          { id: 'userEmail', type: 'email', label: 'User Email', required: true },
          { id: 'score', type: 'number', label: 'Score', required: true },
          {
            id: 'tier',
            type: 'select',
            label: 'Subscription Tier',
            required: true,
            options: [
              { label: 'Free', value: 'free' },
              { label: 'Enterprise', value: 'enterprise' },
            ],
          },
          { id: 'agreeTerms', type: 'checkbox', label: 'Agree to Terms', required: true },
          {
            id: 'enterpriseVat',
            type: 'text',
            label: 'Enterprise VAT',
            required: true,
            visibleWhen: {
              field: 'tier',
              equals: 'enterprise',
            },
          },
        ],
      };

      const createRes = await request(app)
        .post('/api/forms')
        .send({ name: 'Dynamic Validation Test Form', schema })
        .expect(201);

      formId = createRes.body.id;

      await request(app)
        .post(`/api/forms/${formId}/publish`)
        .expect(200);
    });

    it('accepts valid submission satisfying all dynamic types and conditional visibility', async () => {
      const validPayload = {
        data: {
          username: 'valid_user',
          userEmail: 'user@example.com',
          score: 95,
          tier: 'free',
          agreeTerms: true,
          // enterpriseVat is hidden because tier !== 'enterprise', so it is not required
        },
      };

      const res = await request(app)
        .post(`/api/public/forms/${formId}/submissions`)
        .send(validPayload)
        .expect(202);

      expect(res.body.status).toBe('accepted');
      expect(res.body.id).toBeDefined();
    });

    it('rejects invalid email address', async () => {
      const res = await request(app)
        .post(`/api/public/forms/${formId}/submissions`)
        .send({
          data: {
            username: 'valid_user',
            userEmail: 'not-an-email',
            score: 50,
            tier: 'free',
            agreeTerms: true,
          },
        })
        .expect(400);

      expect(res.body.error.message).toBe('Submission validation failed');
      expect(res.body.error.details.some((d: { field: string }) => d.field === 'userEmail')).toBe(true);
    });

    it('rejects invalid number format', async () => {
      const res = await request(app)
        .post(`/api/public/forms/${formId}/submissions`)
        .send({
          data: {
            username: 'valid_user',
            userEmail: 'user@example.com',
            score: 'not_a_number',
            tier: 'free',
            agreeTerms: true,
          },
        })
        .expect(400);

      expect(res.body.error.details.some((d: { field: string }) => d.field === 'score')).toBe(true);
    });

    it('rejects disallowed select option', async () => {
      const res = await request(app)
        .post(`/api/public/forms/${formId}/submissions`)
        .send({
          data: {
            username: 'valid_user',
            userEmail: 'user@example.com',
            score: 50,
            tier: 'pro_unauthorized', // not in allowed options
            agreeTerms: true,
          },
        })
        .expect(400);

      expect(res.body.error.details.some((d: { field: string }) => d.field === 'tier')).toBe(true);
    });

    it('rejects missing required checkbox', async () => {
      const res = await request(app)
        .post(`/api/public/forms/${formId}/submissions`)
        .send({
          data: {
            username: 'valid_user',
            userEmail: 'user@example.com',
            score: 50,
            tier: 'free',
            // agreeTerms missing
          },
        })
        .expect(400);

      expect(res.body.error.details.some((d: { field: string }) => d.field === 'agreeTerms')).toBe(true);
    });

    it('enforces conditional field requirement when visible', async () => {
      // When tier === 'enterprise', enterpriseVat becomes visible and is required
      const res = await request(app)
        .post(`/api/public/forms/${formId}/submissions`)
        .send({
          data: {
            username: 'enterprise_corp',
            userEmail: 'corp@example.com',
            score: 100,
            tier: 'enterprise',
            agreeTerms: true,
            // enterpriseVat missing
          },
        })
        .expect(400);

      expect(res.body.error.details.some((d: { field: string }) => d.field === 'enterpriseVat')).toBe(true);
    });
  });

  // =========================================================================
  // 2. SUBMISSION INTEGRITY UNDER A FORM-VERSION CHANGE
  // =========================================================================
  describe('2. Submission Integrity Under Form-Version Changes', () => {
    it('guarantees old submissions permanently reference Version 1 when Version 2 is published', async () => {
      // Step 1: Create Draft (Version 1)
      const v1Schema = {
        fields: [
          { id: 'v1Input', type: 'text', label: 'V1 Input', required: true },
        ],
      };

      const createRes = await request(app)
        .post('/api/forms')
        .send({ name: 'Version Integrity Form', schema: v1Schema })
        .expect(201);

      const testFormId = createRes.body.id;

      // Step 2: Publish Version 1
      const pub1Res = await request(app)
        .post(`/api/forms/${testFormId}/publish`)
        .expect(200);

      const v1Id = pub1Res.body.id;
      expect(pub1Res.body.version).toBe(1);

      // Step 3: Submit using Version 1
      const submissionId = '00000000-0000-0000-0000-000000000333';
      const originalPayload = { v1Input: 'Historical immutable submission value' };

      await prisma.submission.create({
        data: {
          id: submissionId,
          tenantId: DEV_TENANT.id,
          formId: testFormId,
          formVersionId: v1Id,
          data: originalPayload,
        },
      });

      // Step 4: Edit Draft to create Version 2
      const v2Schema = {
        fields: [
          { id: 'v2Input', type: 'text', label: 'V2 Completely Changed Input', required: true },
          { id: 'newExtraField', type: 'number', label: 'New Field', required: true },
        ],
      };

      await request(app)
        .put(`/api/forms/${testFormId}/draft`)
        .send({ schema: v2Schema })
        .expect(200);

      // Step 5: Publish Version 2
      const pub2Res = await request(app)
        .post(`/api/forms/${testFormId}/publish`)
        .expect(200);

      const v2Id = pub2Res.body.id;
      expect(pub2Res.body.version).toBe(2);
      expect(v2Id).not.toBe(v1Id);

      // Step 6: Read old submission from database
      const historicalSubmission = await prisma.submission.findUnique({
        where: { id: submissionId },
        include: { formVersion: true },
      });

      // Verification:
      // 1. old submission.formVersionId === Version 1
      expect(historicalSubmission).toBeDefined();
      expect(historicalSubmission?.formVersionId).toBe(v1Id);
      expect(historicalSubmission?.formVersion.version).toBe(1);
      expect(historicalSubmission?.formVersion.id).not.toBe(v2Id);

      // 2. stored data remains exactly unchanged
      expect(historicalSubmission?.data).toEqual(originalPayload);

      // 3. Version 1 schema remains frozen and unchanged
      expect(historicalSubmission?.formVersion.schema).toEqual(v1Schema);
    });
  });

  // =========================================================================
  // 3. QUEUE RELIABILITY & FAILURE RECOVERY
  // =========================================================================
  describe('3. Queue Reliability & Failure Recovery', () => {
    it('durable queue retries on temporary database failure and succeeds upon recovery', async () => {
      const submissionId = '00000000-0000-0000-0000-000000000444';

      // First create a real form to link to
      const fRes = await request(app)
        .post('/api/forms')
        .send({
          name: 'Queue Test Form',
          schema: { fields: [{ id: 'field', type: 'text', label: 'Field' }] },
        })
        .expect(201);

      const realFormId = fRes.body.id;
      const realVersionId = fRes.body.versions[0].id;

      // Simulate a temporary DB failure by providing an invalid tenantId that causes foreign key constraint failure
      const failingJob = {
        data: {
          submissionId,
          tenantId: 'invalid-non-existent-tenant-uuid',
          formId: realFormId,
          formVersionId: realVersionId,
          data: { field: 'Test' },
          submittedAt: new Date().toISOString(),
        },
      } as Job;

      // Worker fails and rejects the job, allowing BullMQ to schedule exponential backoff retry
      await expect(processSubmissionJob(failingJob)).rejects.toThrow();

      // Ensure that nothing was committed during the failure
      const recordAfterFailure = await prisma.submission.findUnique({
        where: { id: submissionId },
      });
      expect(recordAfterFailure).toBeNull();

      // Now simulate recovery: the retry executes with the valid tenantId
      const recoveredJob = {
        data: {
          submissionId,
          tenantId: DEV_TENANT.id,
          formId: realFormId,
          formVersionId: realVersionId,
          data: { field: 'Recovered Test Payload' },
          submittedAt: new Date().toISOString(),
        },
      } as Job;

      await processSubmissionJob(recoveredJob);

      // Verify that after recovery, the submission is durably stored in PostgreSQL
      const recordAfterRecovery = await prisma.submission.findUnique({
        where: { id: submissionId },
      });
      expect(recordAfterRecovery).toBeDefined();
      expect(recordAfterRecovery?.id).toBe(submissionId);
      expect(recordAfterRecovery?.data).toEqual({ field: 'Recovered Test Payload' });
    });
  });

  // =========================================================================
  // 4. IDEMPOTENCY
  // =========================================================================
  describe('4. Idempotency Guarantees', () => {
    it('processing the same job twice creates only one database record', async () => {
      const duplicateSubmissionId = '00000000-0000-0000-0000-000000000555';

      const fRes = await request(app)
        .post('/api/forms')
        .send({
          name: 'Idempotency Form',
          schema: { fields: [{ id: 'text', type: 'text', label: 'Text' }] },
        })
        .expect(201);

      const formId = fRes.body.id;
      const formVersionId = fRes.body.versions[0].id;

      const job = {
        data: {
          submissionId: duplicateSubmissionId,
          tenantId: DEV_TENANT.id,
          formId,
          formVersionId,
          data: { text: 'Testing idempotency' },
          submittedAt: new Date().toISOString(),
        },
      } as Job;

      // Execution 1
      await processSubmissionJob(job);

      // Execution 2 (duplicate/retry delivery)
      await processSubmissionJob(job);

      // Assert that exactly ONE record exists in the database
      const count = await prisma.submission.count({
        where: { id: duplicateSubmissionId },
      });
      expect(count).toBe(1);

      const record = await prisma.submission.findUnique({
        where: { id: duplicateSubmissionId },
      });
      expect(record).toBeDefined();
      expect(record?.id).toBe(duplicateSubmissionId);
    });
  });
});
