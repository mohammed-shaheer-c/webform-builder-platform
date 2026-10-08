import { FormSchema, FormField } from '../schemas/form.schema';

export interface ValidationErrorDetail {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationErrorDetail[];
  cleanedData: Record<string, unknown>;
}

/**
 * Evaluates whether a field is visible based on conditional visibility rules
 */
export function isFieldVisible(field: FormField, data: Record<string, unknown>): boolean {
  if (!field.visibleWhen) {
    return true;
  }

  const dependentValue = data[field.visibleWhen.field];
  return dependentValue === field.visibleWhen.equals;
}

/**
 * Authoritative server-side validation of submission data against a published form schema.
 * Never trusts frontend client-side validation.
 */
export function validateSubmissionData(
  schema: FormSchema,
  rawSubmission: unknown
): ValidationResult {
  const errors: ValidationErrorDetail[] = [];

  if (typeof rawSubmission !== 'object' || rawSubmission === null || Array.isArray(rawSubmission)) {
    return {
      isValid: false,
      errors: [{ field: 'data', message: 'Submission data must be a JSON object' }],
      cleanedData: {},
    };
  }

  const data = rawSubmission as Record<string, unknown>;
  const fieldMap = new Map<string, FormField>();
  schema.fields.forEach((f) => fieldMap.set(f.id, f));

  // 1. Reject unknown fields not declared in the schema
  for (const key of Object.keys(data)) {
    if (!fieldMap.has(key)) {
      errors.push({
        field: key,
        message: `Unknown field "${key}" is not part of this form schema`,
      });
    }
  }

  const cleanedData: Record<string, unknown> = {};

  // 2. Authoritative field validation
  for (const field of schema.fields) {
    const isVisible = isFieldVisible(field, data);
    const value = data[field.id];

    // If the field is not visible, it is NOT required and conditional validation is bypassed
    if (!isVisible) {
      if (value !== undefined) {
        cleanedData[field.id] = value;
      }
      continue;
    }

    const isEmpty =
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '') ||
      (Array.isArray(value) && value.length === 0);

    // Required field validation
    if (field.required && isEmpty) {
      errors.push({
        field: field.id,
        message: `${field.label} is required`,
      });
      continue;
    }

    if (isEmpty) {
      continue;
    }

    // Type-specific validation
    switch (field.type) {
      case 'text': {
        if (typeof value !== 'string') {
          errors.push({ field: field.id, message: `${field.label} must be a text string` });
        } else {
          cleanedData[field.id] = value.trim();
        }
        break;
      }

      case 'email': {
        if (typeof value !== 'string') {
          errors.push({ field: field.id, message: `${field.label} must be a valid email string` });
        } else {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          const trimmed = value.trim();
          if (!emailRegex.test(trimmed)) {
            errors.push({
              field: field.id,
              message: `Invalid email address format for ${field.label}`,
            });
          } else {
            cleanedData[field.id] = trimmed.toLowerCase();
          }
        }
        break;
      }

      case 'number': {
        const num = typeof value === 'number' ? value : Number(value);
        if (
          typeof value !== 'number' &&
          (typeof value !== 'string' || isNaN(num) || value.trim() === '')
        ) {
          errors.push({ field: field.id, message: `${field.label} must be a valid number` });
        } else if (isNaN(num)) {
          errors.push({ field: field.id, message: `${field.label} must be a valid number` });
        } else {
          cleanedData[field.id] = num;
        }
        break;
      }

      case 'select':
      case 'radio': {
        if (typeof value !== 'string' && typeof value !== 'number') {
          errors.push({ field: field.id, message: `Invalid value for ${field.label}` });
          break;
        }
        const strVal = String(value);
        const validValues = (field.options || []).map((opt) =>
          typeof opt === 'string' ? opt : opt.value
        );
        if (!validValues.includes(strVal)) {
          errors.push({
            field: field.id,
            message: `Selected value "${strVal}" is not an allowed option for ${field.label}`,
          });
        } else {
          cleanedData[field.id] = strVal;
        }
        break;
      }

      case 'multiselect': {
        if (!Array.isArray(value)) {
          errors.push({
            field: field.id,
            message: `${field.label} must be an array of selected options`,
          });
          break;
        }
        const validValues = new Set(
          (field.options || []).map((opt) => (typeof opt === 'string' ? opt : opt.value))
        );
        let hasInvalidOption = false;
        for (const item of value) {
          const strItem = String(item);
          if (!validValues.has(strItem)) {
            errors.push({
              field: field.id,
              message: `Option "${strItem}" is not allowed for ${field.label}`,
            });
            hasInvalidOption = true;
            break;
          }
        }
        if (!hasInvalidOption) {
          cleanedData[field.id] = value.map((v) => String(v));
        }
        break;
      }

      case 'checkbox': {
        if (typeof value !== 'boolean') {
          errors.push({
            field: field.id,
            message: `${field.label} must be a boolean (true or false)`,
          });
        } else {
          cleanedData[field.id] = value;
        }
        break;
      }

      case 'date': {
        if (typeof value !== 'string' || isNaN(Date.parse(value))) {
          errors.push({ field: field.id, message: `${field.label} must be a valid date string` });
        } else {
          cleanedData[field.id] = value;
        }
        break;
      }

      default:
        cleanedData[field.id] = value;
        break;
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    cleanedData,
  };
}
