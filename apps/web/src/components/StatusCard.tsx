import React from 'react';
import { ConnectionStatus } from '../types/api';
import { RefreshCw, Server, CheckCircle2, AlertCircle } from 'lucide-react';

interface StatusCardProps {
  status: ConnectionStatus;
  errorMessage?: string | null;
  onRefresh: () => void;
}

export const StatusCard: React.FC<StatusCardProps> = ({
  status,
  errorMessage,
  onRefresh,
}) => {
  return (
    <div className="card">
      <div className="status-panel">
        <div className="status-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Server size={18} color="#9ca3af" />
            <span className="status-label">API Service Status</span>
          </div>

          <div
            className={`status-pill ${status}`}
            data-testid="status-indicator"
          >
            <span className="pulse-dot" />
            {status === 'connected' && 'Backend: Connected'}
            {status === 'checking' && 'Backend: Checking...'}
            {status === 'error' && 'Backend: Disconnected'}
          </div>
        </div>

        {status === 'error' && errorMessage && (
          <div
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: '#f87171',
              fontSize: '0.8125rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {status === 'connected' && (
          <div
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.8125rem',
              color: '#10b981',
              padding: '0.25rem 0',
            }}
          >
            <CheckCircle2 size={16} />
            <span>Health check passed (GET /api/health)</span>
          </div>
        )}

        <button
          type="button"
          onClick={onRefresh}
          className="retry-button"
          disabled={status === 'checking'}
        >
          <RefreshCw
            size={14}
            className={status === 'checking' ? 'animate-spin' : ''}
          />
          {status === 'checking' ? 'Checking...' : 'Check Again'}
        </button>
      </div>

      <div className="meta-grid">
        <div className="meta-item">
          <div className="meta-key">API Endpoint</div>
          <div className="meta-val">/api/health</div>
        </div>
        <div className="meta-item">
          <div className="meta-key">Environment</div>
          <div className="meta-val">Development</div>
        </div>
        <div className="meta-item">
          <div className="meta-key">Database</div>
          <div className="meta-val">PostgreSQL (Prisma)</div>
        </div>
        <div className="meta-item">
          <div className="meta-key">Background Queue</div>
          <div className="meta-val">Redis (BullMQ ready)</div>
        </div>
      </div>
    </div>
  );
};
