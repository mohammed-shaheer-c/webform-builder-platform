import { z } from 'zod';

export const SupportedFieldType = z.enum([
  'text',
  'email',
  'number',
  'select',
  'multiselect',
  'radio',
  'checkbox',
  'date',
]);

export type SupportedFieldType = z.infer<typeof SupportedFieldType>;

export const FieldOptionSchema = z.union([
  z.string().min(1, 'Option cannot be empty'),
  z.object({
    label: z.string().min(1, 'Option label is required'),
    value: z.string().min(1, 'Option value is required'),
  }),
]);

export const ConditionalVisibilitySchema = z.object({
  field: z.string().min(1, 'Target field ID is required'),
  equals: z.any(),
});

export type ConditionalVisibility = z.infer<typeof ConditionalVisibilitySchema>;

export const FormFieldSchema = z
  .object({
    id: z
      .string({ required_error: 'Field id is required' })
      .min(1, 'Field id cannot be empty')
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        'Field id must only contain letters, numbers, underscores, or hyphens'
      ),
    type: SupportedFieldType,
    label: z
      .string({ required_error: 'Field label is required' })
      .min(1, 'Field label cannot be empty'),
    required: z.boolean().default(false),
    placeholder: z.string().optional(),
    description: z.string().optional(),
    options: z.array(FieldOptionSchema).optional(),
    defaultValue: z.any().optional(),
    visibleWhen: ConditionalVisibilitySchema.optional(),
  })
  .superRefine((field, ctx) => {
    // If field type requires options (select, multiselect, radio), ensure options are provided and not empty
    if (['select', 'multiselect', 'radio'].includes(field.type)) {
      if (!field.options || field.options.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Field type "${field.type}" requires a non-empty "options" list`,
          path: ['options'],
        });
      }
    }

    // Prevent self-referencing conditional visibility
    if (field.visibleWhen && field.visibleWhen.field === field.id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A field cannot have conditional visibility depending on itself',
        path: ['visibleWhen', 'field'],
      });
    }
  });

export type FormField = z.infer<typeof FormFieldSchema>;

export const FormSchemaDefinition = z
  .object({
    fields: z
      .array(FormFieldSchema, {
        required_error: 'Schema "fields" array is required',
      })
      .min(1, 'Form schema must contain at least one field'),
  })
  .superRefine((schema, ctx) => {
    const seenIds = new Set<string>();
    schema.fields.forEach((field, index) => {
      if (seenIds.has(field.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate field id "${field.id}" is not allowed`,
          path: ['fields', index, 'id'],
        });
      }
      seenIds.add(field.id);
    });

    // Verify that conditional visibility targets refer to existing fields in the schema
    schema.fields.forEach((field, index) => {
      if (field.visibleWhen && !seenIds.has(field.visibleWhen.field)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Conditional visibility references unknown field "${field.visibleWhen.field}"`,
          path: ['fields', index, 'visibleWhen', 'field'],
        });
      }
    });
  });

export type FormSchema = z.infer<typeof FormSchemaDefinition>;

export const CreateFormSchema = z.object({
  name: z
    .string({ required_error: 'Form name is required' })
    .trim()
    .min(1, 'Form name cannot be empty')
    .max(255, 'Form name cannot exceed 255 characters'),
  schema: FormSchemaDefinition,
});

export type CreateFormInput = z.infer<typeof CreateFormSchema>;

export const UpdateDraftSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  schema: FormSchemaDefinition,
});

export type UpdateDraftInput = z.infer<typeof UpdateDraftSchema>;

export const PublicSubmissionSchema = z.object({
  data: z.record(z.any(), {
    required_error: 'Submission data object is required',
  }),
});

export type PublicSubmissionInput = z.infer<typeof PublicSubmissionSchema>;
