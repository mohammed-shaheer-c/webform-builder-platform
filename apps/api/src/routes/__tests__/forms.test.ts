import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../config/prisma';
import { DEV_TENANT } from '../../config/tenant';

describe('Forms API', () => {
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
    // Clean up test forms created for dev tenant
    await prisma.form.deleteMany({
      where: { tenantId: DEV_TENANT.id },
    });
    await prisma.$disconnect();
  });

  describe('POST /api/forms - Creation & Draft Management', () => {
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
          fields: [
            {
              id: 'name',
              type: 'text',
              label: 'Name',
            },
          ],
        },
      };

      const res = await request(app)
        .post('/api/forms')
        .send(payload)
        .expect(400);

      expect(res.body.error).toBeDefined();
      expect(res.body.error.message).toBe('Validation failed');
    });

    it('rejects form creation when schema fields array is empty', async () => {
      const payload = {
        name: 'Empty Fields Form',
        schema: {
          fields: [],
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
          fields: [
            {
              id: 'custom_input',
              type: 'invalid_unsupported_type',
              label: 'Invalid',
            },
          ],
        },
      };

      const res = await request(app)
        .post('/api/forms')
        .send(payload)
        .expect(400);

      expect(res.body.error.message).toBe('Validation failed');
      const hasTypeIssue = res.body.error.details.some(
        (d: { path: string }) => d.path.includes('type')
      );
      expect(hasTypeIssue).toBe(true);
    });

    it('rejects form creation with duplicate field IDs', async () => {
      const payload = {
        name: 'Duplicate IDs Form',
        schema: {
          fields: [
            {
              id: 'user_email',
              type: 'email',
              label: 'Email 1',
            },
            {
              id: 'user_email',
              type: 'text',
              label: 'Email 2',
            },
          ],
        },
      };

      const res = await request(app)
        .post('/api/forms')
        .send(payload)
        .expect(400);

      expect(res.body.error.message).toBe('Validation failed');
      const hasDuplicateIssue = res.body.error.details.some(
        (d: { message: string }) => d.message.includes('Duplicate field id')
      );
      expect(hasDuplicateIssue).toBe(true);
    });

    it('rejects select or radio field when options array is missing or empty', async () => {
      const payload = {
        name: 'Missing Options Form',
        schema: {
          fields: [
            {
              id: 'category',
              type: 'select',
              label: 'Category',
              // options missing
            },
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

  describe('GET /api/forms & GET /api/forms/:id', () => {
    it('retrieves all forms for the development tenant', async () => {
      // First create a form
      const payload = {
        name: 'Listing Test Form',
        schema: {
          fields: [
            {
              id: 'title',
              type: 'text',
              label: 'Title',
            },
          ],
        },
      };

      const createRes = await request(app)
        .post('/api/forms')
        .send(payload)
        .expect(201);

      const res = await request(app)
        .get('/api/forms')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const found = res.body.find((f: { id: string }) => f.id === createRes.body.id);
      expect(found).toBeDefined();
      expect(found.tenantId).toBe(DEV_TENANT.id);
      expect(found.versions.length).toBeGreaterThanOrEqual(1);
    });

    it('retrieves an existing form by ID with its draft version', async () => {
      const payload = {
        name: 'Single Form Fetch Test',
        schema: {
          fields: [
            {
              id: 'age',
              type: 'number',
              label: 'Age',
            },
          ],
        },
      };

      const createRes = await request(app)
        .post('/api/forms')
        .send(payload)
        .expect(201);

      const res = await request(app)
        .get(`/api/forms/${createRes.body.id}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body.id).toBe(createRes.body.id);
      expect(res.body.name).toBe('Single Form Fetch Test');
      expect(res.body.versions[0].version).toBe(1);
      expect(res.body.versions[0].status).toBe('DRAFT');
    });

    it('returns 404 Not Found for non-existent form ID', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000999';
      const res = await request(app)
        .get(`/api/forms/${nonExistentId}`)
        .expect(404);

      expect(res.body.error).toBeDefined();
      expect(res.body.error.message).toBe('Form not found');
    });
  });
});
