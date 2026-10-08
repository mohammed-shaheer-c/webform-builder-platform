import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  getHealthStatus,
  getForms,
  createForm,
  updateDraft,
  publishForm,
  getSubmissions,
  FormItem,
  SubmissionsResponse,
} from '../services/api';
import { ConnectionStatus } from '../types/api';
import { StatusCard } from '../components/StatusCard';
import {
  Layers,
  Plus,
  ExternalLink,
  Table,
  CheckCircle2,
  Clock,
  Sparkles,
  X,
  FileText,
  Send,
  Loader2,
  RefreshCw,
  Trash2,
  Sliders,
  Code2,
  Edit3,
} from 'lucide-react';

interface DynamicFieldConfig {
  id: string;
  type: 'text' | 'email' | 'number' | 'select' | 'multiselect' | 'radio' | 'checkbox' | 'date';
  label: string;
  required: boolean;
  optionsText?: string; // Comma-separated for select/radio
}

const DEFAULT_BUILDER_FIELDS: DynamicFieldConfig[] = [
  { id: 'fullName', type: 'text', label: 'Full Name', required: true },
  { id: 'email', type: 'email', label: 'Email Address', required: true },
  { id: 'rating', type: 'number', label: 'Rating (1-100)', required: true },
  {
    id: 'category',
    type: 'select',
    label: 'Category',
    required: true,
    optionsText: 'Technical Support, Billing, Feature Request',
  },
  { id: 'subscribe', type: 'checkbox', label: 'Subscribe to Newsletter', required: false },
];

const PRESET_TEMPLATES: Record<
  string,
  { label: string; description: string; fields: DynamicFieldConfig[] }
> = {
  feedback: {
    label: 'Customer Feedback',
    description: 'Collect user ratings, feedback category, and newsletter opt-in.',
    fields: [
      { id: 'name', type: 'text', label: 'Your Name', required: true },
      { id: 'email', type: 'email', label: 'Email Address', required: true },
      { id: 'score', type: 'number', label: 'Satisfaction Score (1-10)', required: true },
      {
        id: 'tier',
        type: 'select',
        label: 'Account Tier',
        required: true,
        optionsText: 'Free, Pro, Enterprise',
      },
      { id: 'comments', type: 'text', label: 'Additional Comments', required: false },
    ],
  },
  contact: {
    label: 'Lead Contact Form',
    description: 'Standard business lead contact form with email, subject, and message.',
    fields: [
      { id: 'fullName', type: 'text', label: 'Full Name', required: true },
      { id: 'workEmail', type: 'email', label: 'Work Email', required: true },
      { id: 'subject', type: 'text', label: 'Inquiry Subject', required: true },
      { id: 'message', type: 'text', label: 'How can we help?', required: true },
    ],
  },
  event: {
    label: 'Event Registration',
    description: 'Attendee details, ticket pass selection, and terms acceptance.',
    fields: [
      { id: 'attendeeName', type: 'text', label: 'Attendee Name', required: true },
      { id: 'email', type: 'email', label: 'Confirmation Email', required: true },
      {
        id: 'passType',
        type: 'radio',
        label: 'Pass Type',
        required: true,
        optionsText: 'General Admission, VIP Pass ($199)',
      },
      { id: 'eventDate', type: 'date', label: 'Preferred Date', required: false },
      { id: 'terms', type: 'checkbox', label: 'I accept event terms & conditions', required: true },
    ],
  },
};

export const HomePage: React.FC = () => {
  const [status, setStatus] = useState<ConnectionStatus>('checking');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Forms list state
  const [forms, setForms] = useState<FormItem[]>([]);
  const [isLoadingForms, setIsLoadingForms] = useState<boolean>(true);
  const [formsError, setFormsError] = useState<string | null>(null);

  // Create form modal state
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [mode, setMode] = useState<'visual' | 'json'>('visual');
  const [formName, setFormName] = useState<string>('My Custom Dynamic Form');
  const [builderFields, setBuilderFields] = useState<DynamicFieldConfig[]>(DEFAULT_BUILDER_FIELDS);
  const [rawJsonSchema, setRawJsonSchema] = useState<string>(
    JSON.stringify(
      {
        fields: [
          { id: 'name', type: 'text', label: 'Full Name', required: true },
          { id: 'email', type: 'email', label: 'Email Address', required: true },
        ],
      },
      null,
      2
    )
  );
  const [publishImmediately, setPublishImmediately] = useState<boolean>(true);
  const [isSubmittingForm, setIsSubmittingForm] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdSuccessFormId, setCreatedSuccessFormId] = useState<string | null>(null);
  const [editingForm, setEditingForm] = useState<FormItem | null>(null);

  // Submissions modal state
  const [viewingSubmissionsForm, setViewingSubmissionsForm] = useState<FormItem | null>(null);
  const [submissionsData, setSubmissionsData] = useState<SubmissionsResponse | null>(null);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState<boolean>(false);

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
      setErrorMessage(err instanceof Error ? err.message : 'Unable to connect to backend');
    }
  }, []);

  const loadForms = useCallback(async () => {
    setIsLoadingForms(true);
    setFormsError(null);
    try {
      const data = await getForms();
      setForms(data);
    } catch (err) {
      setFormsError(err instanceof Error ? err.message : 'Failed to fetch forms');
    } finally {
      setIsLoadingForms(false);
    }
  }, []);

  useEffect(() => {
    checkConnection();
    loadForms();
  }, [checkConnection, loadForms]);

  // Field manipulation helpers
  const handleAddField = () => {
    const newId = `field_${Date.now()}`;
    setBuilderFields((prev) => [
      ...prev,
      {
        id: newId,
        type: 'text',
        label: `New Field ${prev.length + 1}`,
        required: false,
      },
    ]);
  };

  const handleRemoveField = (index: number) => {
    setBuilderFields((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateField = (index: number, updates: Partial<DynamicFieldConfig>) => {
    setBuilderFields((prev) =>
      prev.map((field, i) => {
        if (i !== index) return field;
        const updated = { ...field, ...updates };
        if (updates.label && (!field.id || field.id.startsWith('field_'))) {
          // Auto-generate a clean ID from label
          updated.id = updates.label
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
        }
        return updated;
      })
    );
  };

  const handleSelectTemplate = (templateKey: string) => {
    const tpl = PRESET_TEMPLATES[templateKey];
    if (tpl) {
      setBuilderFields(tpl.fields);
    }
  };

  // Convert builder fields to final schema JSON
  const buildSchemaObject = () => {
    if (mode === 'json') {
      return JSON.parse(rawJsonSchema);
    }

    const fields = builderFields.map((f) => {
      const base: any = {
        id: f.id || `field_${Math.random().toString(36).substring(2, 7)}`,
        type: f.type,
        label: f.label || 'Untitled Field',
        required: f.required,
      };

      if (['select', 'radio', 'multiselect'].includes(f.type)) {
        const rawOptions = (f.optionsText || 'Option 1, Option 2')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        base.options = rawOptions.map((opt) => ({
          label: opt,
          value: opt.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        }));
      }

      return base;
    });

    return { fields };
  };

  const handleOpenEdit = (form: FormItem) => {
    setEditingForm(form);
    setFormName(form.name);
    setCreateError(null);
    setCreatedSuccessFormId(null);

    const latestVersion = form.versions[0];
    if (latestVersion && latestVersion.schema && Array.isArray(latestVersion.schema.fields)) {
      const fields: DynamicFieldConfig[] = latestVersion.schema.fields.map((f: any) => ({
        id: f.id,
        type: f.type,
        label: f.label,
        required: Boolean(f.required),
        optionsText: f.options ? f.options.map((o: any) => o.label).join(', ') : undefined,
      }));
      setBuilderFields(fields);
      setRawJsonSchema(JSON.stringify(latestVersion.schema, null, 2));
    }
    setIsCreateOpen(true);
  };

  const handleCreateForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    setIsSubmittingForm(true);
    setCreateError(null);
    setCreatedSuccessFormId(null);

    try {
      const schema = buildSchemaObject();

      if (editingForm) {
        // Updates draft or creates new draft version if latest is published
        await updateDraft(editingForm.id, schema, formName.trim());
        if (publishImmediately) {
          await publishForm(editingForm.id);
        }
        setCreatedSuccessFormId(editingForm.id);
      } else {
        const created = await createForm(formName.trim(), schema);
        if (publishImmediately) {
          await publishForm(created.id);
        }
        setCreatedSuccessFormId(created.id);
      }

      await loadForms();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to save form');
    } finally {
      setIsSubmittingForm(false);
    }
  };

  const handlePublish = async (formId: string) => {
    try {
      await publishForm(formId);
      await loadForms();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Publish failed');
    }
  };

  const handleOpenSubmissions = async (form: FormItem) => {
    setViewingSubmissionsForm(form);
    setIsLoadingSubmissions(true);
    try {
      const res = await getSubmissions(form.id);
      setSubmissionsData(res);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to load submissions');
    } finally {
      setIsLoadingSubmissions(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: '1080px', padding: '2.5rem 1.5rem' }}>
      {/* Header */}
      <header className="header-section" style={{ marginBottom: '2rem' }}>
        <div className="brand-badge">
          <Layers size={14} />
          <span>Webform Platform v1.0</span>
        </div>
        <h1 className="main-title">Dynamic Form Platform</h1>
        <p className="subtitle">
          Design dynamic schemas, publish immutable versions, share public forms, and process burst submissions with BullMQ &amp; PostgreSQL.
        </p>
      </header>

      {/* Connection Status Card */}
      <div style={{ width: '100%', marginBottom: '2.5rem' }}>
        <StatusCard status={status} errorMessage={errorMessage} onRefresh={checkConnection} />
      </div>

      {/* Forms Section Header */}
      <section style={{ width: '100%' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1.25rem',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f9fafb' }}>Your Forms</h2>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
              Published forms accept submissions through high-speed BullMQ queue buffering.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={loadForms}
              className="retry-button"
              style={{ padding: '0.6rem 0.9rem', fontSize: '0.8125rem' }}
              title="Refresh Forms"
            >
              <RefreshCw size={14} className={isLoadingForms ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCreatedSuccessFormId(null);
                setCreateError(null);
                setIsCreateOpen(true);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                backgroundColor: 'var(--accent-indigo)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '0.6rem 1.25rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
              }}
            >
              <Plus size={16} />
              <span>Create Dynamic Form</span>
            </button>
          </div>
        </div>

        {/* Forms Grid */}
        {isLoadingForms ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <Loader2 size={32} className="animate-spin" color="#6366f1" style={{ margin: '0 auto 1rem' }} />
            <p style={{ color: '#9ca3af' }}>Loading platform forms...</p>
          </div>
        ) : formsError ? (
          <div className="card" style={{ textAlign: 'center', padding: '2rem', borderColor: 'var(--status-error)' }}>
            <p style={{ color: '#f87171', marginBottom: '1rem' }}>{formsError}</p>
            <button type="button" onClick={loadForms} className="retry-button">
              Retry
            </button>
          </div>
        ) : forms.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
            <FileText size={48} color="#6366f1" style={{ margin: '0 auto 1rem', opacity: 0.8 }} />
            <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: '#f9fafb' }}>No Forms Created Yet</h3>
            <p style={{ color: '#9ca3af', marginBottom: '1.5rem', maxWidth: '420px', margin: '0 auto 1.5rem' }}>
              Create your first dynamic form to generate a public submission link and start collecting responses.
            </p>
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                backgroundColor: 'var(--accent-indigo)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '0.75rem 1.5rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Plus size={16} />
              <span>Create First Form</span>
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
            {forms.map((form) => {
              const publishedVersion = form.versions.find((v) => v.status === 'PUBLISHED');
              const draftVersion = form.versions.find((v) => v.status === 'DRAFT');
              const isPublished = Boolean(publishedVersion);

              return (
                <div
                  key={form.id}
                  className="card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '1.5rem',
                    transition: 'transform 0.2s, border-color 0.2s',
                  }}
                >
                  <div>
                    {/* Badge row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      {isPublished ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            padding: '0.2rem 0.6rem',
                            borderRadius: '9999px',
                            backgroundColor: 'rgba(16, 185, 129, 0.15)',
                            color: '#34d399',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                          }}
                        >
                          <CheckCircle2 size={12} />
                          <span>v{publishedVersion?.version} Live</span>
                        </span>
                      ) : (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            padding: '0.2rem 0.6rem',
                            borderRadius: '9999px',
                            backgroundColor: 'rgba(245, 158, 11, 0.15)',
                            color: '#fbbf24',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                          }}
                        >
                          <Clock size={12} />
                          <span>v{draftVersion?.version || 1} Draft Only</span>
                        </span>
                      )}

                      <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        {new Date(form.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#f9fafb', marginBottom: '0.5rem' }}>
                      {form.name}
                    </h3>

                    <p style={{ fontSize: '0.8125rem', color: '#9ca3af', marginBottom: '1.25rem' }}>
                      ID: <code style={{ fontSize: '0.75rem', color: '#a5b4fc' }}>{form.id.slice(0, 8)}...</code> &bull;{' '}
                      {form.versions.length} version{form.versions.length === 1 ? '' : 's'}
                    </p>
                  </div>

                  {/* Actions Row */}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
                    {isPublished ? (
                      <Link
                        to={`/forms/${form.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          flex: 1,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.4rem',
                          padding: '0.55rem 0.75rem',
                          backgroundColor: 'rgba(99, 102, 241, 0.15)',
                          color: '#a5b4fc',
                          border: '1px solid rgba(99, 102, 241, 0.3)',
                          borderRadius: '6px',
                          textDecoration: 'none',
                          fontSize: '0.8125rem',
                          fontWeight: 500,
                        }}
                      >
                        <ExternalLink size={14} />
                        <span>Open Public Form</span>
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handlePublish(form.id)}
                        style={{
                          flex: 1,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.4rem',
                          padding: '0.55rem 0.75rem',
                          backgroundColor: 'rgba(245, 158, 11, 0.15)',
                          color: '#fbbf24',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          borderRadius: '6px',
                          fontSize: '0.8125rem',
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        <Sparkles size={14} />
                        <span>Publish to Live</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleOpenSubmissions(form)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        padding: '0.55rem 0.75rem',
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        color: '#d1d5db',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        fontSize: '0.8125rem',
                        cursor: 'pointer',
                      }}
                    >
                      <Table size={14} />
                      <span>Submissions</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEdit(form)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.35rem',
                        padding: '0.55rem 0.75rem',
                        backgroundColor: 'rgba(99, 102, 241, 0.1)',
                        color: '#c7d2fe',
                        border: '1px solid rgba(99, 102, 241, 0.25)',
                        borderRadius: '6px',
                        fontSize: '0.8125rem',
                        cursor: 'pointer',
                      }}
                      title="Edit fields and create the next immutable version"
                    >
                      <Edit3 size={13} />
                      <span>New Version</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* CREATE DYNAMIC FORM MODAL / BUILDER */}
      {isCreateOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '1rem',
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '680px',
              backgroundColor: '#111827',
              border: '1px solid rgba(255, 255, 255, 0.18)',
              padding: '2rem',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Sparkles size={20} color="#6366f1" />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f9fafb' }}>
                  {editingForm
                    ? `Create Version ${(editingForm.versions[0]?.version || 1) + 1} (${editingForm.name})`
                    : 'Dynamic Form Builder'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {createdSuccessFormId ? (
              <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                <CheckCircle2 size={54} color="#10b981" style={{ margin: '0 auto 1rem' }} />
                <h4 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f9fafb', marginBottom: '0.5rem' }}>
                  Form Created &amp; Published Successfully!
                </h4>
                <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                  Your dynamic form is live and ready to accept responses.
                </p>

                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                  <Link
                    to={`/forms/${createdSuccessFormId}`}
                    target="_blank"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.75rem 1.5rem',
                      backgroundColor: 'var(--accent-indigo)',
                      color: '#ffffff',
                      borderRadius: '8px',
                      textDecoration: 'none',
                      fontWeight: 600,
                    }}
                  >
                    <ExternalLink size={16} />
                    <span>Open Public Form Now</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreateOpen(false);
                      setCreatedSuccessFormId(null);
                    }}
                    className="retry-button"
                  >
                    Back to Dashboard
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateForm}>
                {createError && (
                  <div
                    style={{
                      padding: '0.75rem',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '6px',
                      color: '#f87171',
                      fontSize: '0.8125rem',
                      marginBottom: '1.25rem',
                    }}
                  >
                    {createError}
                  </div>
                )}

                {/* Form Title */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#e5e7eb', marginBottom: '0.5rem' }}>
                    Form Title
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g., Customer Support Intake Form"
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      color: '#f9fafb',
                      fontSize: '0.9375rem',
                    }}
                  />
                </div>

                {/* Mode Selector & Preset Templates Bar */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '1rem',
                    paddingBottom: '0.75rem',
                    borderBottom: '1px solid var(--border-color)',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => setMode('visual')}
                      style={{
                        padding: '0.4rem 0.8rem',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer',
                        backgroundColor: mode === 'visual' ? 'var(--accent-indigo)' : 'rgba(255, 255, 255, 0.05)',
                        color: mode === 'visual' ? '#ffffff' : '#9ca3af',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}
                    >
                      <Sliders size={14} />
                      <span>Visual Builder</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('json')}
                      style={{
                        padding: '0.4rem 0.8rem',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer',
                        backgroundColor: mode === 'json' ? 'var(--accent-indigo)' : 'rgba(255, 255, 255, 0.05)',
                        color: mode === 'json' ? '#ffffff' : '#9ca3af',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}
                    >
                      <Code2 size={14} />
                      <span>JSON Schema</span>
                    </button>
                  </div>

                  {mode === 'visual' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Preset:</span>
                      {Object.keys(PRESET_TEMPLATES).map((tplKey) => (
                        <button
                          key={tplKey}
                          type="button"
                          onClick={() => handleSelectTemplate(tplKey)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.75rem',
                            backgroundColor: 'rgba(255, 255, 255, 0.04)',
                            border: '1px solid var(--border-color)',
                            color: '#cbd5e1',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          {PRESET_TEMPLATES[tplKey].label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Visual Fields Builder */}
                {mode === 'visual' ? (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <label style={{ fontSize: '0.875rem', fontWeight: 600, color: '#e5e7eb' }}>
                        Dynamic Fields ({builderFields.length})
                      </label>
                      <button
                        type="button"
                        onClick={handleAddField}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.35rem 0.75rem',
                          backgroundColor: 'rgba(99, 102, 241, 0.15)',
                          color: '#a5b4fc',
                          border: '1px solid rgba(99, 102, 241, 0.3)',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <Plus size={14} />
                        <span>Add Field</span>
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {builderFields.map((field, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: '0.85rem',
                            backgroundColor: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                          }}
                        >
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px auto', gap: '0.75rem', alignItems: 'center' }}>
                            {/* Label */}
                            <input
                              type="text"
                              value={field.label}
                              onChange={(e) => handleUpdateField(idx, { label: e.target.value })}
                              placeholder="Field Label (e.g. Work Email)"
                              style={{
                                padding: '0.5rem 0.75rem',
                                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '6px',
                                color: '#ffffff',
                                fontSize: '0.875rem',
                              }}
                            />

                            {/* Type selector */}
                            <select
                              value={field.type}
                              onChange={(e) => handleUpdateField(idx, { type: e.target.value as any })}
                              style={{
                                padding: '0.5rem 0.5rem',
                                backgroundColor: '#1e293b',
                                border: '1px solid var(--border-color)',
                                borderRadius: '6px',
                                color: '#ffffff',
                                fontSize: '0.8125rem',
                              }}
                            >
                              <option value="text">text</option>
                              <option value="email">email</option>
                              <option value="number">number</option>
                              <option value="select">select</option>
                              <option value="radio">radio</option>
                              <option value="multiselect">multiselect</option>
                              <option value="checkbox">checkbox</option>
                              <option value="date">date</option>
                            </select>

                            {/* Delete button */}
                            <button
                              type="button"
                              onClick={() => handleRemoveField(idx)}
                              title="Delete Field"
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#ef4444',
                                cursor: 'pointer',
                                padding: '0.4rem',
                              }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.6rem', fontSize: '0.75rem', color: '#9ca3af' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span>Field ID:</span>
                              <code style={{ color: '#a5b4fc', fontSize: '0.75rem' }}>{field.id}</code>
                            </div>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', color: '#cbd5e1' }}>
                              <input
                                type="checkbox"
                                checked={field.required}
                                onChange={(e) => handleUpdateField(idx, { required: e.target.checked })}
                              />
                              <span>Required field</span>
                            </label>
                          </div>

                          {/* Options editor for select / radio / multiselect */}
                          {['select', 'radio', 'multiselect'].includes(field.type) && (
                            <div style={{ marginTop: '0.6rem' }}>
                              <label style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
                                Options (comma-separated):
                              </label>
                              <input
                                type="text"
                                value={field.optionsText || ''}
                                onChange={(e) => handleUpdateField(idx, { optionsText: e.target.value })}
                                placeholder="Option 1, Option 2, Option 3"
                                style={{
                                  width: '100%',
                                  padding: '0.4rem 0.6rem',
                                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                                  border: '1px solid var(--border-color)',
                                  borderRadius: '4px',
                                  color: '#e2e8f0',
                                  fontSize: '0.8125rem',
                                }}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* JSON Editor Mode */
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#e5e7eb', marginBottom: '0.5rem' }}>
                      Raw JSON Schema (Supports <code>visibleWhen</code> conditional rules)
                    </label>
                    <textarea
                      rows={12}
                      value={rawJsonSchema}
                      onChange={(e) => setRawJsonSchema(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        backgroundColor: '#0f172a',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        color: '#38bdf8',
                        fontFamily: 'monospace',
                        fontSize: '0.8125rem',
                        lineHeight: 1.5,
                      }}
                    />
                  </div>
                )}

                {/* Publish Immediately Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', padding: '0.75rem', backgroundColor: 'rgba(16, 185, 129, 0.05)', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <input
                    type="checkbox"
                    id="pubNow"
                    checked={publishImmediately}
                    onChange={(e) => setPublishImmediately(e.target.checked)}
                  />
                  <label htmlFor="pubNow" style={{ fontSize: '0.875rem', color: '#34d399', fontWeight: 500, cursor: 'pointer' }}>
                    {editingForm
                      ? `Publish immediately as Version ${(editingForm.versions[0]?.version || 1) + 1} Live`
                      : 'Publish immediately as Version 1 Live (ready for public submissions)'}
                  </label>
                </div>

                {/* Modal Footer Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={() => setIsCreateOpen(false)}
                    className="retry-button"
                    style={{ padding: '0.6rem 1rem' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingForm}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      backgroundColor: 'var(--accent-indigo)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '0.6rem 1.25rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {isSubmittingForm ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    <span>
                      {editingForm
                        ? publishImmediately
                          ? `Release v${(editingForm.versions[0]?.version || 1) + 1} Live`
                          : 'Save as New Draft'
                        : publishImmediately
                        ? 'Create & Publish Live'
                        : 'Save Draft'}
                    </span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* VIEW SUBMISSIONS MODAL */}
      {viewingSubmissionsForm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '1rem',
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '840px',
              backgroundColor: '#111827',
              border: '1px solid rgba(255, 255, 255, 0.18)',
              padding: '2rem',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f9fafb' }}>
                  {viewingSubmissionsForm.name} &mdash; Recorded Submissions
                </h3>
                <p style={{ fontSize: '0.8125rem', color: '#9ca3af' }}>
                  Total Responses in PostgreSQL: <strong>{submissionsData?.total ?? 0}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingSubmissionsForm(null)}
                style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Submissions Content */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {isLoadingSubmissions ? (
                <div style={{ textAlign: 'center', padding: '3.5rem' }}>
                  <Loader2 size={32} className="animate-spin" color="#6366f1" style={{ margin: '0 auto 1rem' }} />
                  <p style={{ color: '#9ca3af' }}>Fetching recorded submissions from database...</p>
                </div>
              ) : !submissionsData || !submissionsData.items || submissionsData.items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
                  <CheckCircle2 size={42} color="#6366f1" style={{ margin: '0 auto 1rem', opacity: 0.6 }} />
                  <h4 style={{ fontSize: '1.125rem', color: '#f9fafb', marginBottom: '0.5rem' }}>
                    No Submissions Recorded Yet
                  </h4>
                  <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1.5rem', maxWidth: '420px', margin: '0 auto 1.5rem' }}>
                    This form hasn't received any submissions yet. Open the form in your browser and submit your first response!
                  </p>
                  <Link
                    to={`/forms/${viewingSubmissionsForm.id}`}
                    target="_blank"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.65rem 1.25rem',
                      backgroundColor: 'var(--accent-indigo)',
                      color: '#ffffff',
                      borderRadius: '8px',
                      textDecoration: 'none',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                    }}
                  >
                    <ExternalLink size={15} />
                    <span>Open Form &amp; Submit a Response</span>
                  </Link>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {submissionsData.items.map((sub, idx) => (
                    <div
                      key={sub.id}
                      style={{
                        padding: '1rem',
                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '0.75rem',
                          color: '#9ca3af',
                          marginBottom: '0.75rem',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                          paddingBottom: '0.4rem',
                        }}
                      >
                        <span>
                          <strong>#{idx + 1}</strong> &bull; UUID: <code style={{ color: '#a5b4fc' }}>{sub.id}</code>
                        </span>
                        <span>{new Date(sub.createdAt).toLocaleString()}</span>
                      </div>

                      {/* Key-Value Display */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        {Object.entries(sub.data).map(([k, v]) => (
                          <div
                            key={k}
                            style={{
                              padding: '0.4rem 0.6rem',
                              backgroundColor: 'rgba(0, 0, 0, 0.25)',
                              borderRadius: '4px',
                              fontSize: '0.8125rem',
                            }}
                          >
                            <span style={{ color: '#9ca3af', fontSize: '0.75rem', display: 'block' }}>{k}</span>
                            <span style={{ color: '#f1f5f9', fontWeight: 500 }}>
                              {typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Link
                to={`/forms/${viewingSubmissionsForm.id}`}
                target="_blank"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  color: '#a5b4fc',
                  fontSize: '0.8125rem',
                  textDecoration: 'none',
                }}
              >
                <ExternalLink size={14} />
                <span>Open public form page</span>
              </Link>
              <button
                type="button"
                onClick={() => setViewingSubmissionsForm(null)}
                className="retry-button"
                style={{ padding: '0.6rem 1.25rem' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={{ marginTop: '3rem', textAlign: 'center', color: '#6b7280', fontSize: '0.8125rem' }}>
        Webform Platform &bull; Node.js Express &bull; React Vite &bull; Redis + BullMQ &bull; PostgreSQL Neon
      </footer>
    </div>
  );
};

export default HomePage;
