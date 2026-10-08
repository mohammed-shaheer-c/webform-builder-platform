import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../config/prisma';
import { validateBody } from '../middleware/validate';
import { formSubmissionRateLimiter } from '../middleware/rateLimiter';
import { PublicSubmissionSchema, FormSchema } from '../schemas/form.schema';
import { validateSubmissionData } from '../services/submissionValidator';
import { addSubmissionJob } from '../queue/submissionQueue';

const router = Router();

/**
 * GET /api/public/forms/:formId
 * Public endpoint to fetch the current published schema of a form.
 * Never returns draft schema or exposes tenant details.
 * Returns 404 if no published version exists.
 */
router.get(
  '/forms/:formId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { formId } = req.params;

      const form = await prisma.form.findUnique({
        where: { id: formId },
      });

      if (!form) {
        res.status(404).json({
          error: {
            message: 'Form not found',
          },
        });
        return;
      }

      // Find the latest published version
      const publishedVersion = await prisma.formVersion.findFirst({
        where: {
          formId: form.id,
          status: 'PUBLISHED',
        },
        orderBy: {
          version: 'desc',
        },
      });

      if (!publishedVersion) {
        res.status(404).json({
          error: {
            message: 'This form has not been published yet',
          },
        });
        return;
      }

      // Return public form representation without tenant metadata
      res.status(200).json({
        id: form.id,
        name: form.name,
        version: publishedVersion.version,
        formVersionId: publishedVersion.id,
        schema: publishedVersion.schema,
        publishedAt: publishedVersion.publishedAt,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/public/forms/:formId/submissions
 * Asynchronous public submission endpoint protected by BullMQ and rate limiting.
 * Validates authoritatively against published schema, creates a durable queue job,
 * and returns 202 Accepted.
 */
router.post(
  '/forms/:formId/submissions',
  formSubmissionRateLimiter,
  validateBody(PublicSubmissionSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { formId } = req.params;
      const { data: rawSubmissionData } = req.body;

      const form = await prisma.form.findUnique({
        where: { id: formId },
      });

      if (!form) {
        res.status(404).json({
          error: {
            message: 'Form not found',
          },
        });
        return;
      }

      // Retrieve the current published version
      const publishedVersion = await prisma.formVersion.findFirst({
        where: {
          formId: form.id,
          status: 'PUBLISHED',
        },
        orderBy: {
          version: 'desc',
        },
      });

      if (!publishedVersion) {
        res.status(404).json({
          error: {
            message: 'Cannot submit to an unpublished form',
          },
        });
        return;
      }

      // Authoritative server-side validation against the published JSON schema
      const schema = publishedVersion.schema as unknown as FormSchema;
      const validation = validateSubmissionData(schema, rawSubmissionData);

      if (!validation.isValid) {
        res.status(400).json({
          error: {
            message: 'Submission validation failed',
            details: validation.errors,
          },
        });
        return;
      }

      // Generate submission ID prior to queuing to act as idempotency key & database primary key
      const submissionId = crypto.randomUUID();
      const submittedAt = new Date().toISOString();

      // Enqueue submission job to BullMQ
      await addSubmissionJob({
        submissionId,
        tenantId: form.tenantId,
        formId: form.id,
        formVersionId: publishedVersion.id,
        data: validation.cleanedData,
        submittedAt,
      });

      // Return 202 Accepted response
      res.status(202).json({
        id: submissionId,
        status: 'accepted',
        formId: form.id,
        formVersionId: publishedVersion.id,
        message: 'Submission accepted for asynchronous processing',
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
