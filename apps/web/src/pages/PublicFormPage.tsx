import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getPublicForm, submitPublicForm } from '../services/publicApi';
import { PublicFormResponse, SubmissionResponse } from '../types/form';
import { DynamicFormRenderer } from '../components/DynamicFormRenderer';
import { CheckCircle2, AlertTriangle, ArrowLeft, Loader2, Sparkles } from 'lucide-react';

export const PublicFormPage: React.FC = () => {
  const { formId } = useParams<{ formId: string }>();
  const [form, setForm] = useState<PublicFormResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [submissionResult, setSubmissionResult] = useState<SubmissionResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (!formId) {
      setError('Form ID is missing from URL.');
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    getPublicForm(formId)
      .then((data) => {
        if (isMounted) {
          setForm(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Unable to load public form');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [formId]);

  const handleSubmit = async (data: Record<string, unknown>) => {
    if (!formId) return;

    setIsSubmitting(true);
    setServerError(null);

    try {
      const result = await submitPublicForm(formId, data);
      setSubmissionResult(result);
    } catch (err: unknown) {
      const e = err as Error & { details?: Array<{ message: string; field: string }> };
      if (e.details && Array.isArray(e.details)) {
        setServerError(
          `Validation failed: ${e.details.map((d) => d.message).join(', ')}`
        );
      } else {
        setServerError(e.message || 'An error occurred while submitting');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center' }}>
        <Loader2 size={36} className="animate-spin" color="#6366f1" style={{ margin: '0 auto 1rem' }} />
        <p style={{ color: '#9ca3af' }}>Loading published form...</p>
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="container">
        <div className="card" style={{ textAlign: 'center', margin: '0 auto' }}>
          <AlertTriangle size={48} color="#ef4444" style={{ margin: '0 auto 1rem' }} />
          <h2 style={{ marginBottom: '0.5rem', color: '#f9fafb' }}>Form Not Available</h2>
          <p style={{ color: '#9ca3af', marginBottom: '1.5rem', lineHeight: '1.6' }}>
            {error || 'This form could not be found or has not been published.'}
          </p>
          <Link to="/" className="retry-button" style={{ display: 'inline-flex', textDecoration: 'none' }}>
            <ArrowLeft size={16} />
            <span>Return to Home</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div style={{ width: '100%', maxWidth: '640px', margin: '0 auto' }}>
        <header className="header-section" style={{ textAlign: 'left', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <Link to="/" style={{ color: '#a5b4fc', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem' }}>
              <ArrowLeft size={14} />
              <span>Back</span>
            </Link>
            <div className="brand-badge" style={{ margin: 0 }}>
              <Sparkles size={12} />
              <span>Published v{form.version}</span>
            </div>
          </div>
          <h1 className="main-title" style={{ fontSize: '2.25rem' }}>{form.name}</h1>
          <p className="subtitle">
            Please fill out all required fields below. Your response will be securely recorded.
          </p>
        </header>

        {submissionResult ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
            <CheckCircle2 size={56} color="#10b981" style={{ margin: '0 auto 1.25rem' }} />
            <h2 style={{ fontSize: '1.75rem', marginBottom: '0.75rem', color: '#f9fafb' }}>
              Response Submitted!
            </h2>
            <p style={{ color: '#9ca3af', marginBottom: '1.5rem', lineHeight: '1.6' }}>
              Thank you. Your submission has been validated and recorded securely under form version {form.version}.
            </p>
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '1rem',
                fontSize: '0.8125rem',
                color: '#9ca3af',
                marginBottom: '2rem',
                textAlign: 'left',
              }}
            >
              <div><strong>Submission ID:</strong> {submissionResult.id}</div>
              <div><strong>Recorded At:</strong> {new Date(submissionResult.createdAt).toLocaleString()}</div>
            </div>
            <button
              type="button"
              className="retry-button"
              onClick={() => {
                setSubmissionResult(null);
                setServerError(null);
              }}
            >
              Submit Another Response
            </button>
          </div>
        ) : (
          <div className="card">
            {serverError && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  color: '#f87171',
                  marginBottom: '1.5rem',
                  fontSize: '0.875rem',
                }}
              >
                {serverError}
              </div>
            )}

            <DynamicFormRenderer
              schema={form.schema}
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
            />
          </div>
        )}
      </div>
    </div>
  );
};
