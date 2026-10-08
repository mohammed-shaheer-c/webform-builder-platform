import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../config/prisma';
import { DEV_TENANT } from '../../config/tenant';
import { submissionQueue, closeSubmissionQueue } from '../../queue/submissionQueue';
import { processSubmissionJob, closeSubmissionWorker } from '../../queue/submissionWorker';
import { Job } from 'bullmq';

describe('Webform Platform API', () => {
  beforeAll(async () => {
    // Ensure development tenant exists
    await prisma.tenant.upsert({
      where: { id: DEV_TENANT.id },
      update: {},
      create: {
        id: DEV_TENANT.id,
        name: DEV_TENANT.name,
      },
    });
  });

  afterAll(async () => {
    // Clean up test data for dev tenant
    await prisma.submission.deleteMany({
      where: { tenantId: DEV_TENANT.id },
    });
    await prisma.formVersion.deleteMany({
      where: { form: { tenantId: DEV_TENANT.id } },
    });
    await prisma.form.deleteMany({
      where: { tenantId: DEV_TENANT.id },
    });

    // Close background queue and worker cleanly
    await closeSubmissionWorker();
    await closeSubmissionQueue();
    await prisma.$disconnect();
  });

  describe('Form Creation & Draft Management', () => {
    it('successfully creates a form and initial DRAFT FormVersion (version 1)', async () => {
      const payload = {
        name: 'Contact Us Form',
        schema: {
          fields: [
            {
              id: 'name',
              type: 'text',
              label: 'Full Name',
              required: true,
              placeholder: 'Enter your name',
            },
            {
              id: 'email',
              type: 'email',
              label: 'Work Email',
              required: true,
            },
            {
              id: 'department',
              type: 'select',
              label: 'Department',
              required: false,
              options: [
                { label: 'Sales', value: 'sales' },
                { label: 'Engineering', value: 'engineering' },
              ],
            },
          ],
        },
      };

      const res = await request(app)
        .post('/api/forms')
        .send(payload)
        .expect('Content-Type', /json/)
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Contact Us Form');
      expect(res.body.tenantId).toBe(DEV_TENANT.id);
      expect(res.body.versions).toHaveLength(1);

      const version = res.body.versions[0];
      expect(version.version).toBe(1);
      expect(version.status).toBe('DRAFT');
      expect(version.schema).toEqual(payload.schema);
      expect(version.publishedAt).toBeNull();
    });

    it('rejects form creation when name is missing', async () => {
      const payload = {
        schema: {
          fields: [{ id: 'name', type: 'text', label: 'Name' }],
        },
      };

      const res = await request(app)
        .post('/api/forms')
        .send(payload)
        .expect(400);

      expect(res.body.error).toBeDefined();
      expect(res.body.error.message).toBe('Validation failed');
    });

    it('rejects form creation with unsupported field type', async () => {
      const payload = {
        name: 'Invalid Type Form',
        schema: {
          fields: [{ id: 'custom', type: 'unsupported_type', label: 'Custom' }],
        },
      };

      const res = await request(app)
        .post('/api/forms')
        .send(payload)
        .expect(400);

      expect(res.body.error.message).toBe('Validation failed');
    });

    it('rejects form creation with duplicate field IDs', async () => {
      const payload = {
        name: 'Duplicate Form',
        schema: {
          fields: [
            { id: 'field1', type: 'text', label: 'Field 1' },
            { id: 'field1', type: 'email', label: 'Field 2' },
          ],
        },
      };

      const res = await request(app)
        .post('/api/forms')
        .send(payload)
        .expect(400);

      expect(res.body.error.message).toBe('Validation failed');
    });
  });

  describe('Form Versioning, Immutability & Publishing', () => {
    it('manages draft editing and immutable publishing across versions', async () => {
      // 1. Create a form with initial V1 draft schema
      const initialSchema = {
        fields: [
          { id: 'username', type: 'text', label: 'Username', required: true },
        ],
      };

      const createRes = await request(app)
        .post('/api/forms')
        .send({ name: 'Versioning Test Form', schema: initialSchema })
        .expect(201);

      const formId = createRes.body.id;

      // 2. Publish Version 1
      const pub1Res = await request(app)
        .post(`/api/forms/${formId}/publish`)
        .expect(200);

      expect(pub1Res.body.version).toBe(1);
      expect(pub1Res.body.status).toBe('PUBLISHED');
      expect(pub1Res.body.publishedAt).not.toBeNull();
      expect(pub1Res.body.schema).toEqual(initialSchema);

      const v1Id = pub1Res.body.id;

      // 3. Edit draft -> Should spawn a new Version 2 DRAFT without touching Version 1
      const updatedSchema = {
        fields: [
          { id: 'username', type: 'text', label: 'Username', required: true },
          { id: 'bio', type: 'text', label: 'Bio', required: false },
        ],
      };

      const draftEditRes = await request(app)
        .put(`/api/forms/${formId}/draft`)
        .send({ schema: updatedSchema })
        .expect(200);

      expect(draftEditRes.body.version).toBe(2);
      expect(draftEditRes.body.status).toBe('DRAFT');
      expect(draftEditRes.body.schema).toEqual(updatedSchema);
      expect(draftEditRes.body.id).not.toBe(v1Id);

      // Verify Version 1 in DB remains completely unchanged
      const v1DbRecord = await prisma.formVersion.findUnique({
        where: { id: v1Id },
      });
      expect(v1DbRecord?.version).toBe(1);
      expect(v1DbRecord?.status).toBe('PUBLISHED');
      expect(v1DbRecord?.schema).toEqual(initialSchema);

      // 4. Publish Version 2
      const pub2Res = await request(app)
        .post(`/api/forms/${formId}/publish`)
        .expect(200);

      expect(pub2Res.body.version).toBe(2);
      expect(pub2Res.body.status).toBe('PUBLISHED');
      expect(pub2Res.body.schema).toEqual(updatedSchema);

      // 5. Query all versions
      const versionsRes = await request(app)
        .get(`/api/forms/${formId}/versions`)
        .expect(200);

      expect(versionsRes.body).toHaveLength(2);
      expect(versionsRes.body[0].version).toBe(2);
      expect(versionsRes.body[1].version).toBe(1);

      // 6. Verify again that Version 1 schema remains strictly identical
      expect(versionsRes.body[1].schema).toEqual(initialSchema);
    });

    it('rejects publishing when no draft exists', async () => {
      // Create and publish V1
      const createRes = await request(app)
        .post('/api/forms')
        .send({
          name: 'Double Publish Form',
          schema: { fields: [{ id: 'title', type: 'text', label: 'Title' }] },
        })
        .expect(201);

      await request(app)
        .post(`/api/forms/${createRes.body.id}/publish`)
        .expect(200);

      // Attempt to publish again immediately without a new draft
      const secondPubRes = await request(app)
        .post(`/api/forms/${createRes.body.id}/publish`)
        .expect(400);

      expect(secondPubRes.body.error.message).toBe(
        'No draft version available to publish for this form'
      );
    });
  });

  describe('Public Form Serving (GET /api/public/forms/:formId)', () => {
    it('returns 404 for unpublished forms and serves only published schema once published', async () => {
      // Create a form in DRAFT status
      const createRes = await request(app)
        .post('/api/forms')
        .send({
          name: 'Public Test Form',
          schema: { fields: [{ id: 'q1', type: 'text', label: 'Question 1' }] },
        })
        .expect(201);

      const formId = createRes.body.id;

      // Un-published form should return 404
      await request(app)
        .get(`/api/public/forms/${formId}`)
        .expect(404);

      // Publish V1
      await request(app)
        .post(`/api/forms/${formId}/publish`)
        .expect(200);

      // Create a new DRAFT V2
      await request(app)
        .put(`/api/forms/${formId}/draft`)
        .send({
          schema: {
            fields: [
              { id: 'q1', type: 'text', label: 'Question 1' },
              { id: 'q2', type: 'text', label: 'Draft Question 2' },
            ],
          },
        })
        .expect(200);

      // Public endpoint must return PUBLISHED Version 1, NEVER draft Version 2
      const publicRes = await request(app)
        .get(`/api/public/forms/${formId}`)
        .expect(200);

      expect(publicRes.body.id).toBe(formId);
      expect(publicRes.body.name).toBe('Public Test Form');
      expect(publicRes.body.version).toBe(1);
      expect(publicRes.body.schema.fields).toHaveLength(1);
      expect(publicRes.body.schema.fields[0].id).toBe('q1');
      expect(publicRes.body.tenantId).toBeUndefined(); // internal tenantId hidden
    });
  });

  describe('Redis + BullMQ Asynchronous Submissions & Worker Processing', () => {
    let testFormId: string;
    let v1VersionId: string;

    beforeAll(async () => {
      const schema = {
        fields: [
          { id: 'fullName', type: 'text', label: 'Full Name', required: true },
          { id: 'email', type: 'email', label: 'Email', required: true },
          { id: 'age', type: 'number', label: 'Age', required: false },
          {
            id: 'role',
            type: 'select',
            label: 'Role',
            required: true,
            options: [
              { label: 'Developer', value: 'developer' },
              { label: 'Designer', value: 'designer' },
            ],
          },
          {
            id: 'frameworks',
            type: 'multiselect',
            label: 'Frameworks',
            required: false,
            options: ['react', 'vue', 'angular'],
          },
          {
            id: 'accountType',
            type: 'radio',
            label: 'Account Type',
            required: true,
            options: [
              { label: 'Personal', value: 'personal' },
              { label: 'Business', value: 'business' },
            ],
          },
          {
            id: 'companyName',
            type: 'text',
            label: 'Company Name',
            required: true,
            visibleWhen: {
              field: 'accountType',
              equals: 'business',
            },
          },
        ],
      };

      const formRes = await request(app)
        .post('/api/forms')
        .send({ name: 'Submission Test Form', schema })
        .expect(201);

      testFormId = formRes.body.id;

      const pubRes = await request(app)
        .post(`/api/forms/${testFormId}/publish`)
        .expect(200);

      v1VersionId = pubRes.body.id;
    });

    it('submission creates a queue job and returns 202 Accepted', async () => {
      const payload = {
        data: {
          fullName: 'Alice Smith',
          email: 'alice@example.com',
          age: 28,
          role: 'developer',
          frameworks: ['react', 'vue'],
          accountType: 'personal',
        },
      };

      const res = await request(app)
        .post(`/api/public/forms/${testFormId}/submissions`)
        .send(payload)
        .expect(202);

      expect(res.body).toHaveProperty('id');
      expect(res.body.status).toBe('accepted');
      expect(res.body.formId).toBe(testFormId);
      expect(res.body.formVersionId).toBe(v1VersionId);

      // Verify that the job was added to BullMQ
      const job = await submissionQueue.getJob(res.body.id);
      expect(job).toBeDefined();
      expect(job?.id).toBe(res.body.id);
      expect(job?.data.submissionId).toBe(res.body.id);
    });

    it('worker stores submission into PostgreSQL', async () => {
      const submissionId = '00000000-0000-0000-0000-000000000099';
      const mockJob = {
        data: {
          submissionId,
          tenantId: DEV_TENANT.id,
          formId: testFormId,
          formVersionId: v1VersionId,
          data: { fullName: 'Worker Test', email: 'worker@test.com' },
          submittedAt: new Date().toISOString(),
        },
      } as Job;

      await processSubmissionJob(mockJob);

      // Verify record exists in PostgreSQL
      const record = await prisma.submission.findUnique({
        where: { id: submissionId },
      });
      expect(record).toBeDefined();
      expect(record?.id).toBe(submissionId);
      expect(record?.tenantId).toBe(DEV_TENANT.id);
      expect(record?.formId).toBe(testFormId);
    });

    it('duplicate job does not create duplicate submission (idempotency)', async () => {
      const submissionId = '00000000-0000-0000-0000-000000000088';
      const mockJob = {
        data: {
          submissionId,
          tenantId: DEV_TENANT.id,
          formId: testFormId,
          formVersionId: v1VersionId,
          data: { fullName: 'Idempotency Test', email: 'idempotent@test.com' },
          submittedAt: new Date().toISOString(),
        },
      } as Job;

      // First execution
      await processSubmissionJob(mockJob);

      // Second duplicate execution with same job data
      await processSubmissionJob(mockJob);

      // Verify only a single record exists
      const count = await prisma.submission.count({
        where: { id: submissionId },
      });
      expect(count).toBe(1);
    });

    it('worker retry handles failure gracefully', async () => {
      // Simulate invalid foreign key failure
      const mockFailingJob = {
        data: {
          submissionId: 'failing-job-id',
          tenantId: 'non-existent-tenant-id',
          formId: testFormId,
          formVersionId: v1VersionId,
          data: {},
          submittedAt: new Date().toISOString(),
        },
      } as Job;

      // Worker should reject, allowing BullMQ to schedule backoff retry
      await expect(processSubmissionJob(mockFailingJob)).rejects.toThrow();
    });

    it('rejects submission missing required field', async () => {
      const payload = {
        data: {
          email: 'alice@example.com',
          role: 'developer',
          accountType: 'personal',
        },
      };

      const res = await request(app)
        .post(`/api/public/forms/${testFormId}/submissions`)
        .send(payload)
        .expect(400);

      expect(res.body.error.message).toBe('Submission validation failed');
      expect(
        res.body.error.details.some((d: { field: string }) => d.field === 'fullName')
      ).toBe(true);
    });

    it('rejects submission with invalid email format', async () => {
      const payload = {
        data: {
          fullName: 'Alice Smith',
          email: 'invalid-email-address',
          role: 'developer',
          accountType: 'personal',
        },
      };

      const res = await request(app)
        .post(`/api/public/forms/${testFormId}/submissions`)
        .send(payload)
        .expect(400);

      expect(
        res.body.error.details.some((d: { field: string }) => d.field === 'email')
      ).toBe(true);
    });

    it('rejects submission with invalid select option', async () => {
      const payload = {
        data: {
          fullName: 'Alice Smith',
          email: 'alice@example.com',
          role: 'unauthorized_role_option',
          accountType: 'personal',
        },
      };

      const res = await request(app)
        .post(`/api/public/forms/${testFormId}/submissions`)
        .send(payload)
        .expect(400);

      expect(
        res.body.error.details.some((d: { field: string }) => d.field === 'role')
      ).toBe(true);
    });

    it('rejects submission with invalid number value', async () => {
      const payload = {
        data: {
          fullName: 'Alice Smith',
          email: 'alice@example.com',
          age: 'not-a-number',
          role: 'developer',
          accountType: 'personal',
        },
      };

      const res = await request(app)
        .post(`/api/public/forms/${testFormId}/submissions`)
        .send(payload)
        .expect(400);

      expect(
        res.body.error.details.some((d: { field: string }) => d.field === 'age')
      ).toBe(true);
    });

    it('enforces conditional visibility: requires field when visible', async () => {
      const payload = {
        data: {
          fullName: 'Bob Brown',
          email: 'bob@business.com',
          role: 'developer',
          accountType: 'business',
        },
      };

      const res = await request(app)
        .post(`/api/public/forms/${testFormId}/submissions`)
        .send(payload)
        .expect(400);

      expect(
        res.body.error.details.some((d: { field: string }) => d.field === 'companyName')
      ).toBe(true);
    });

    it('Critical correctness test: Submission made under V1 permanently references V1 even after V2 is published', async () => {
      const submissionId = '00000000-0000-0000-0000-000000000077';
      await prisma.submission.create({
        data: {
          id: submissionId,
          tenantId: DEV_TENANT.id,
          formId: testFormId,
          formVersionId: v1VersionId,
          data: { fullName: 'Historical User', email: 'historical@example.com' },
        },
      });

      // Now create and publish Version 2 with new schema
      await request(app)
        .put(`/api/forms/${testFormId}/draft`)
        .send({
          schema: {
            fields: [{ id: 'v2Field', type: 'text', label: 'V2 Field', required: true }],
          },
        })
        .expect(200);

      const pub2Res = await request(app)
        .post(`/api/forms/${testFormId}/publish`)
        .expect(200);

      const v2VersionId = pub2Res.body.id;
      expect(v2VersionId).not.toBe(v1VersionId);

      // Verify historical submission STILL points to Version 1
      const oldSubmission = await prisma.submission.findUnique({
        where: { id: submissionId },
        include: { formVersion: true },
      });

      expect(oldSubmission).toBeDefined();
      expect(oldSubmission?.formVersionId).toBe(v1VersionId);
      expect(oldSubmission?.formVersion.version).toBe(1);
    });
  });

  describe('Customer Submission Access (GET /api/forms/:id/submissions)', () => {
    let formAId: string;
    let formBId: string;

    beforeAll(async () => {
      // Create Form A
      const fARes = await request(app)
        .post('/api/forms')
        .send({
          name: 'Form A for Submissions',
          schema: { fields: [{ id: 'input', type: 'text', label: 'Input' }] },
        });
      formAId = fARes.body.id;

      // Create Form B
      const fBRes = await request(app)
        .post('/api/forms')
        .send({
          name: 'Form B for Submissions',
          schema: { fields: [{ id: 'input', type: 'text', label: 'Input' }] },
        });
      formBId = fBRes.body.id;

      const vA = fARes.body.versions[0].id;
      const vB = fBRes.body.versions[0].id;

      // Seed 5 submissions for Form A
      for (let i = 1; i <= 5; i++) {
        await prisma.submission.create({
          data: {
            tenantId: DEV_TENANT.id,
            formId: formAId,
            formVersionId: vA,
            data: { index: i, value: `Submission ${i}` },
            createdAt: new Date(Date.now() + i * 1000),
          },
        });
      }

      // Seed 2 submissions for Form B
      for (let i = 1; i <= 2; i++) {
        await prisma.submission.create({
          data: {
            tenantId: DEV_TENANT.id,
            formId: formBId,
            formVersionId: vB,
            data: { index: i, value: `Form B Submission ${i}` },
          },
        });
      }
    });

    it('enforces form isolation: returns only submissions for requested form', async () => {
      const res = await request(app)
        .get(`/api/forms/${formAId}/submissions`)
        .expect(200);

      expect(res.body.total).toBe(5);
      expect(res.body.items).toHaveLength(5);
      res.body.items.forEach((item: { formId: string }) => {
        expect(item.formId).toBe(formAId);
      });
    });

    it('supports pagination with page and limit parameters', async () => {
      const res = await request(app)
        .get(`/api/forms/${formAId}/submissions?page=1&limit=2`)
        .expect(200);

      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(2);
      expect(res.body.total).toBe(5);
      expect(res.body.items).toHaveLength(2);

      const page2Res = await request(app)
        .get(`/api/forms/${formAId}/submissions?page=2&limit=2`)
        .expect(200);

      expect(page2Res.body.page).toBe(2);
      expect(page2Res.body.items).toHaveLength(2);
      expect(page2Res.body.items[0].id).not.toBe(res.body.items[0].id);
    });

    it('supports sorting by creation date ascending and descending', async () => {
      const descRes = await request(app)
        .get(`/api/forms/${formAId}/submissions?sort=desc`)
        .expect(200);

      const ascRes = await request(app)
        .get(`/api/forms/${formAId}/submissions?sort=asc`)
        .expect(200);

      expect(descRes.body.items[0].id).toBe(
        ascRes.body.items[ascRes.body.items.length - 1].id
      );
    });

    it('enforces maximum page size limit of 100', async () => {
      const res = await request(app)
        .get(`/api/forms/${formAId}/submissions?limit=500`)
        .expect(200);

      expect(res.body.limit).toBe(100);
    });

    it('enforces tenant isolation: returns 404 for non-existent form or other tenant', async () => {
      const res = await request(app)
        .get('/api/forms/00000000-0000-0000-0000-000000000999/submissions')
        .expect(404);

      expect(res.body.error.message).toBe('Form not found');
    });
  });

  describe('Security & Abuse Protection', () => {
    it('rejects oversized request payload exceeding 1MB with 413 Payload Too Large', async () => {
      // Generate a string exceeding 1.1MB
      const oversizedString = 'x'.repeat(1.1 * 1024 * 1024);

      const res = await request(app)
        .post('/api/forms')
        .send({ name: oversizedString, schema: { fields: [] } })
        .expect(413);

      expect(res.body.error.message).toContain('payload too large');
    });

    it('safely handles XSS-style payloads by storing them as harmless text', async () => {
      const fRes = await request(app)
        .post('/api/forms')
        .send({
          name: '<script>alert("XSS")</script>',
          schema: {
            fields: [
              {
                id: 'input',
                type: 'text',
                label: '<img src=x onerror=alert(1)>',
                description: '<b onmouseover=alert(1)>Help</b>',
              },
            ],
          },
        })
        .expect(201);

      expect(fRes.body.name).toBe('<script>alert("XSS")</script>');
      expect(fRes.body.versions[0].schema.fields[0].label).toBe(
        '<img src=x onerror=alert(1)>'
      );
    });
  });
});
