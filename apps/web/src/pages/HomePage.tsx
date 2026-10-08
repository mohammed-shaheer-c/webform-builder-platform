import React, { useEffect, useState, useCallback } from 'react';
import { getHealthStatus } from '../services/api';
import { ConnectionStatus } from '../types/api';
import { StatusCard } from '../components/StatusCard';
import { Layers } from 'lucide-react';

export const HomePage: React.FC = () => {
  const [status, setStatus] = useState<ConnectionStatus>('checking');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const checkConnection = useCallback(async () => {
    setStatus('checking');
    setErrorMessage(null);
    try {
      const data = await getHealthStatus();
      if (data && data.status === 'ok') {
        setStatus('connected');
      } else {
        setStatus('error');
        setErrorMessage('Unexpected response format from API');
      }
    } catch (err) {
      setStatus('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to connect to backend'
      );
    }
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  return (
    <div className="container">
      <header className="header-section">
        <div className="brand-badge">
          <Layers size={14} />
          <span>Foundation Setup</span>
        </div>
        <h1 className="main-title">Webform Platform</h1>
        <p className="subtitle">
          Next-generation extensible webform builder &amp; high-throughput submission platform.
        </p>
      </header>

      <main style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
        <StatusCard
          status={status}
          errorMessage={errorMessage}
          onRefresh={checkConnection}
        />
      </main>

      <footer>
        Webform Platform Foundation &bull; Node.js Express &bull; React Vite &bull; PostgreSQL Prisma &bull; Redis
      </footer>
    </div>
  );
};
