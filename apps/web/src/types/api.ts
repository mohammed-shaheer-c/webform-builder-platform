export interface HealthResponse {
  status: string;
}

export type ConnectionStatus = 'checking' | 'connected' | 'error';
