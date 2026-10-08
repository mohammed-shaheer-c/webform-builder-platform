import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { validateBody } from '../middleware/validate';
import { PublicSubmissionSchema, FormSchema } from '../schemas/form.schema';
import { validateSubmissionData } from '../services/submissionValidator';

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
 * Public submission endpoint with authoritative server-side validation.
 * Binds submission to the exact published form version used.
 */
router.post(
  '/forms/:formId/submissions',
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

      // Store submission directly in PostgreSQL referencing the exact published version
      const submission = await prisma.submission.create({
        data: {
          tenantId: form.tenantId,
          formId: form.id,
          formVersionId: publishedVersion.id,
          data: validation.cleanedData as Prisma.InputJsonValue,
        },
      });

      res.status(201).json({
        id: submission.id,
        formId: submission.formId,
        formVersionId: submission.formVersionId,
        createdAt: submission.createdAt,
        message: 'Submission received successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
