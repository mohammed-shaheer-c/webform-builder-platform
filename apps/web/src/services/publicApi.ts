import { PublicFormResponse, SubmissionResponse } from '../types/form';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

/**
 * Fetches the published schema of a form by form ID
 */
export async function getPublicForm(formId: string): Promise<PublicFormResponse> {
  const response = await fetch(`${API_BASE_URL}/api/public/forms/${formId}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('This form does not exist or has not been published yet.');
    }
    const errBody = await response.json().catch(() => null);
    throw new Error(errBody?.error?.message || `Failed to load form (${response.status})`);
  }

  return response.json();
}

/**
 * Submits form data to the public submission endpoint
 */
export async function submitPublicForm(
  formId: string,
  data: Record<string, unknown>
): Promise<SubmissionResponse> {
  const response = await fetch(`${API_BASE_URL}/api/public/forms/${formId}/submissions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ data }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => null);
    const message = errBody?.error?.message || 'Form submission failed';
    const details = errBody?.error?.details;
    const error = new Error(message) as Error & { details?: unknown };
    error.details = details;
    throw error;
  }

  return response.json();
}
