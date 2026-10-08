import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';
import { tenantMiddleware } from '../middleware/tenant';
import { validateBody } from '../middleware/validate';
import { CreateFormSchema, CreateFormInput } from '../schemas/form.schema';

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
 * Retrieves a single form by ID for the current development tenant
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

export default router;
