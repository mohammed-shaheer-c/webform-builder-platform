import { HealthResponse } from '../types/api';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

/**
 * Calls GET /api/health to verify backend connectivity.
 */
export async function getHealthStatus(): Promise<HealthResponse> {
  const url = `${API_BASE_URL}/api/health`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Health check failed with status: ${response.status}`);
  }

  return response.json();
}

export interface FormVersionItem {
  id: string;
  version: number;
  status: 'DRAFT' | 'PUBLISHED';
  publishedAt?: string | null;
  schema: any;
}

export interface FormItem {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  versions: FormVersionItem[];
}

export interface SubmissionItem {
  id: string;
  formVersionId: string;
  data: Record<string, any>;
  createdAt: string;
}

export interface SubmissionsResponse {
  items: SubmissionItem[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Retrieves all forms for the active tenant.
 */
export async function getForms(): Promise<FormItem[]> {
  const url = `${API_BASE_URL}/api/forms`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load forms: ${response.status}`);
  }
  return response.json();
}

/**
 * Creates a new form with initial draft.
 */
export async function createForm(name: string, schema: any): Promise<FormItem> {
  const url = `${API_BASE_URL}/api/forms`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, schema }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to create form: ${response.status}`);
  }
  return response.json();
}

/**
 * Updates the draft of a form or spawns a new draft version if latest is published.
 */
export async function updateDraft(formId: string, schema: any, name?: string): Promise<FormVersionItem> {
  const url = `${API_BASE_URL}/api/forms/${formId}/draft`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, schema }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to update draft: ${response.status}`);
  }
  return response.json();
}

/**
 * Publishes the draft version of a form.
 */
export async function publishForm(formId: string): Promise<FormVersionItem> {
  const url = `${API_BASE_URL}/api/forms/${formId}/publish`;
  const response = await fetch(url, {
    method: 'POST',
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to publish form: ${response.status}`);
  }
  return response.json();
}

/**
 * Retrieves submissions for a form.
 */
export async function getSubmissions(formId: string): Promise<SubmissionsResponse> {
  const url = `${API_BASE_URL}/api/forms/${formId}/submissions`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load submissions: ${response.status}`);
  }
  return response.json();
}
