import React, { useState } from 'react';
import { FormField, FormSchema } from '../types/form';
import { Send, AlertCircle } from 'lucide-react';

interface DynamicFormRendererProps {
  schema: FormSchema;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  isSubmitting?: boolean;
}

export const DynamicFormRenderer: React.FC<DynamicFormRendererProps> = ({
  schema,
  onSubmit,
  isSubmitting = false,
}) => {
  const [formData, setFormData] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    schema.fields.forEach((f) => {
      if (f.defaultValue !== undefined) {
        initial[f.id] = f.defaultValue;
      } else if (f.type === 'multiselect') {
        initial[f.id] = [];
      } else if (f.type === 'checkbox') {
        initial[f.id] = false;
      } else {
        initial[f.id] = '';
      }
    });
    return initial;
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleFieldChange = (id: string, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      [id]: value,
    }));

    // Clear error for field on change
    if (errors[id]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const isFieldVisible = (field: FormField): boolean => {
    if (!field.visibleWhen) {
      return true;
    }
    const targetVal = formData[field.visibleWhen.field];
    return targetVal === field.visibleWhen.equals;
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    for (const field of schema.fields) {
      if (!isFieldVisible(field)) {
        continue;
      }

      const val = formData[field.id];
      const isEmpty =
        val === undefined ||
        val === null ||
        (typeof val === 'string' && val.trim() === '') ||
        (Array.isArray(val) && val.length === 0);

      // Required validation
      if (field.required && isEmpty) {
        newErrors[field.id] = `${field.label} is required`;
        continue;
      }

      if (isEmpty) {
        continue;
      }

      // Email format
      if (field.type === 'email' && typeof val === 'string') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(val.trim())) {
          newErrors[field.id] = 'Please enter a valid email address';
        }
      }

      // Number validation
      if (field.type === 'number') {
        const num = Number(val);
        if (isNaN(num)) {
          newErrors[field.id] = 'Please enter a valid number';
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      return;
    }

    // Only submit fields that are visible
    const cleanedPayload: Record<string, unknown> = {};
    for (const field of schema.fields) {
      if (isFieldVisible(field)) {
        cleanedPayload[field.id] = formData[field.id];
      }
    }

    await onSubmit(cleanedPayload);
  };

  return (
    <form onSubmit={handleSubmit} className="dynamic-form" noValidate>
      {schema.fields.map((field) => {
        if (!isFieldVisible(field)) {
          return null;
        }

        const fieldError = errors[field.id];
        const rawOptions = field.options || [];
        const normalizedOptions = rawOptions.map((opt) =>
          typeof opt === 'string' ? { label: opt, value: opt } : opt
        );

        return (
          <div key={field.id} className="form-group" data-testid={`field-${field.id}`}>
            <label htmlFor={field.id} className="form-label">
              <span>{field.label}</span>
              {field.required && <span className="required-star">*</span>}
            </label>

            {field.description && (
              <p className="form-description">{field.description}</p>
            )}

            {/* text / email / number / date */}
            {['text', 'email', 'number', 'date'].includes(field.type) && (
              <input
                id={field.id}
                type={field.type}
                className={`form-input ${fieldError ? 'input-error' : ''}`}
                placeholder={field.placeholder || ''}
                value={(formData[field.id] as string | number) ?? ''}
                onChange={(e) =>
                  handleFieldChange(
                    field.id,
                    field.type === 'number'
                      ? e.target.value === ''
                        ? ''
                        : Number(e.target.value)
                      : e.target.value
                  )
                }
              />
            )}

            {/* select */}
            {field.type === 'select' && (
              <select
                id={field.id}
                className={`form-input ${fieldError ? 'input-error' : ''}`}
                value={(formData[field.id] as string) ?? ''}
                onChange={(e) => handleFieldChange(field.id, e.target.value)}
              >
                <option value="">
                  {field.placeholder || '-- Please Select an Option --'}
                </option>
                {normalizedOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}

            {/* radio */}
            {field.type === 'radio' && (
              <div className="options-stack">
                {normalizedOptions.map((opt) => (
                  <label key={opt.value} className="choice-label">
                    <input
                      type="radio"
                      name={field.id}
                      value={opt.value}
                      checked={formData[field.id] === opt.value}
                      onChange={() => handleFieldChange(field.id, opt.value)}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            )}

            {/* multiselect */}
            {field.type === 'multiselect' && (
              <div className="options-stack">
                {normalizedOptions.map((opt) => {
                  const currentSelected = (formData[field.id] as string[]) || [];
                  const isChecked = currentSelected.includes(opt.value);
                  return (
                    <label key={opt.value} className="choice-label">
                      <input
                        type="checkbox"
                        value={opt.value}
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            handleFieldChange(field.id, [...currentSelected, opt.value]);
                          } else {
                            handleFieldChange(
                              field.id,
                              currentSelected.filter((v) => v !== opt.value)
                            );
                          }
                        }}
                      />
                      <span>{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {/* checkbox */}
            {field.type === 'checkbox' && (
              <label className="choice-label checkbox-single">
                <input
                  type="checkbox"
                  id={field.id}
                  checked={Boolean(formData[field.id])}
                  onChange={(e) => handleFieldChange(field.id, e.target.checked)}
                />
                <span>{field.placeholder || field.label}</span>
              </label>
            )}

            {fieldError && (
              <div className="field-error-message">
                <AlertCircle size={14} />
                <span>{fieldError}</span>
              </div>
            )}
          </div>
        );
      })}

      <div style={{ marginTop: '2rem' }}>
        <button
          type="submit"
          className="submit-button"
          disabled={isSubmitting}
        >
          <Send size={16} />
          <span>{isSubmitting ? 'Submitting...' : 'Submit Form'}</span>
        </button>
      </div>
    </form>
  );
};
