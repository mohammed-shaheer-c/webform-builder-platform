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
