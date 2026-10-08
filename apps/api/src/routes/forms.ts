import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';
import { tenantMiddleware } from '../middleware/tenant';
import { validateBody } from '../middleware/validate';
import {
  CreateFormSchema,
  CreateFormInput,
  UpdateDraftSchema,
  UpdateDraftInput,
  FormSchemaDefinition,
} from '../schemas/form.schema';

const router = Router();

// Apply tenant isolation middleware to all form routes
router.use(tenantMiddleware);

/**
 * POST /api/forms
 * Creates a new form and its initial DRAFT FormVersion (version 1)
 */
router.post(
  '/',
  validateBody(CreateFormSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, schema }: CreateFormInput = req.body;
      const tenantId = req.tenantId;

      // Atomically create the form and initial version 1 (DRAFT)
      const newForm = await prisma.$transaction(async (tx) => {
        const form = await tx.form.create({
          data: {
            tenantId,
            name,
          },
        });

        const formVersion = await tx.formVersion.create({
          data: {
            formId: form.id,
            version: 1,
            status: 'DRAFT',
            schema,
          },
        });

        return {
          ...form,
          versions: [formVersion],
        };
      });

      res.status(201).json(newForm);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/forms
 * Retrieves all forms belonging to the current development tenant
 */
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.tenantId;

      const forms = await prisma.form.findMany({
        where: { tenantId },
        include: {
          versions: {
            orderBy: { version: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.status(200).json(forms);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/forms/:id
 * Retrieves a single form by ID with its version history
 */
router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;

      const form = await prisma.form.findFirst({
        where: {
          id,
          tenantId,
        },
        include: {
          versions: {
            orderBy: { version: 'desc' },
          },
        },
      });

      if (!form) {
        res.status(404).json({
          error: {
            message: 'Form not found',
          },
        });
        return;
      }

      res.status(200).json(form);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/forms/:id/draft
 * Updates the current draft schema or creates a new draft version if the latest is published.
 * Published versions are strictly immutable and never modified.
 */
router.put(
  '/:id/draft',
  validateBody(UpdateDraftSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;
      const { name, schema }: UpdateDraftInput = req.body;

      const form = await prisma.form.findFirst({
        where: { id, tenantId },
      });

      if (!form) {
        res.status(404).json({
          error: {
            message: 'Form not found',
          },
        });
        return;
      }

      const result = await prisma.$transaction(async (tx) => {
        // Optionally update form name if provided
        if (name && name !== form.name) {
          await tx.form.update({
            where: { id: form.id },
            data: { name },
          });
        }

        const versions = await tx.formVersion.findMany({
          where: { formId: form.id },
          orderBy: { version: 'desc' },
        });

        const existingDraft = versions.find((v) => v.status === 'DRAFT');

        if (existingDraft) {
          // Update the existing draft schema. Published versions remain untouched.
          const updatedDraft = await tx.formVersion.update({
            where: { id: existingDraft.id },
            data: {
              schema,
            },
          });

          return {
            formId: form.id,
            version: updatedDraft,
            isNewDraft: false,
          };
        } else {
          // If no draft exists (all existing versions are published), create a new draft with the next version number
          const maxVersion = versions.length > 0 ? Math.max(...versions.map((v) => v.version)) : 0;
          const nextVersionNumber = maxVersion + 1;

          const newDraft = await tx.formVersion.create({
            data: {
              formId: form.id,
              version: nextVersionNumber,
              status: 'DRAFT',
              schema,
            },
          });

          return {
            formId: form.id,
            version: newDraft,
            isNewDraft: true,
          };
        }
      });

      res.status(200).json(result.version);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/forms/:id/publish
 * Publishes the current DRAFT version.
 * The published version becomes permanently immutable.
 */
router.post(
  '/:id/publish',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;

      const form = await prisma.form.findFirst({
        where: { id, tenantId },
      });

      if (!form) {
        res.status(404).json({
          error: {
            message: 'Form not found',
          },
        });
        return;
      }

      const publishedVersion = await prisma.$transaction(async (tx) => {
        const versions = await tx.formVersion.findMany({
          where: { formId: form.id },
          orderBy: { version: 'desc' },
        });

        const currentDraft = versions.find((v) => v.status === 'DRAFT');

        if (!currentDraft) {
          throw new Error('NO_DRAFT_FOUND');
        }

        // Validate draft schema structure before publishing
        const validation = FormSchemaDefinition.safeParse(currentDraft.schema);
        if (!validation.success) {
          throw new Error('INVALID_DRAFT_SCHEMA');
        }

        // Transition status from DRAFT to PUBLISHED with publishedAt timestamp
        const published = await tx.formVersion.update({
          where: { id: currentDraft.id },
          data: {
            status: 'PUBLISHED',
            publishedAt: new Date(),
          },
        });

        return published;
      });

      res.status(200).json(publishedVersion);
    } catch (error) {
      if (error instanceof Error && error.message === 'NO_DRAFT_FOUND') {
        res.status(400).json({
          error: {
            message: 'No draft version available to publish for this form',
          },
        });
        return;
      }

      if (error instanceof Error && error.message === 'INVALID_DRAFT_SCHEMA') {
        res.status(400).json({
          error: {
            message: 'Draft schema is invalid and cannot be published',
          },
        });
        return;
      }

      next(error);
    }
  }
);

/**
 * GET /api/forms/:id/versions
 * Retrieves all versions (drafts and published) for a form
 */
router.get(
  '/:id/versions',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;

      const form = await prisma.form.findFirst({
        where: { id, tenantId },
      });

      if (!form) {
        res.status(404).json({
          error: {
            message: 'Form not found',
          },
        });
        return;
      }

      const versions = await prisma.formVersion.findMany({
        where: { formId: form.id },
        orderBy: { version: 'desc' },
      });

      res.status(200).json(versions);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
