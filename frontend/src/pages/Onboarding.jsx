import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, KeyRound, UsersRound } from 'lucide-react';
import AuthLayout from '../components/auth/AuthLayout';
import { useAuth } from '../hooks/useAuth';
import { authApi, organizationsApi } from '../services/api';
import styles from './AuthForms.module.css';

export default function Onboarding() {
  const { user, org, loading, reload } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState('CHOICE');
  const [name, setName] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && org) navigate('/dashboard', { replace: true });
  }, [loading, org, navigate]);

  if (loading) {
    return <AuthLayout variant="onboarding" title="Welcome to Oorkivo" subtitle="Checking your workspace access…"><p>Loading…</p></AuthLayout>;
  }
  if (org) return null;

  const createWorkspace = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await organizationsApi.create({ name: name.trim() });
      localStorage.setItem('current_organization_id', String(response.data.id));
      await reload();
      navigate('/dashboard', { replace: true });
    } catch (createError) {
      const detail = createError.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not create your workspace. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const joinWorkspace = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await authApi.acceptInvitationCode(invitationCode.trim());
      localStorage.setItem('current_organization_id', String(response.data.organization_id));
      await reload();
      navigate('/dashboard', { replace: true });
    } catch (joinError) {
      const data = joinError.response?.data;
      const message = data?.detail ?? data?.code;
      setError(Array.isArray(message) ? message[0] : (message || 'Could not join this workspace.'));
    } finally {
      setSaving(false);
    }
  };

  const suggestedName = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim();
  if (step === 'CHOICE') {
    return (
      <AuthLayout variant="onboarding" title="Welcome to Oorkivo" subtitle="Choose how you’d like to get started.">
        <div className={styles.form}>
          <button className={styles.workspaceChoice} type="button" onClick={() => setStep('CREATE')}>
            <span className={styles.workspaceChoiceIcon}><UsersRound size={18} /></span>
            <span className={styles.workspaceChoiceCopy}><strong>Create a workspace</strong><small>Start a new organization</small></span>
            <ArrowRight className={styles.workspaceChoiceArrow} size={17} />
          </button>
          <div className={styles.divider}><span>or</span></div>
          <button className={styles.workspaceChoice} type="button" onClick={() => setStep('JOIN')}>
            <span className={styles.workspaceChoiceIcon}><KeyRound size={18} /></span>
            <span className={styles.workspaceChoiceCopy}><strong>Join a workspace</strong><small>Have an invitation code?</small></span>
            <ArrowRight className={styles.workspaceChoiceArrow} size={17} />
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      variant="onboarding"
      title={step === 'CREATE' ? 'Create workspace' : 'Join a workspace'}
      subtitle={step === 'CREATE' ? 'Start a new organization.' : 'Enter the invitation code shared with you.'}
    >
      {error && <div className={styles.error} role="alert">{error}</div>}
      {step === 'CREATE' ? (
        <form className={styles.form} onSubmit={createWorkspace}>
          <label className={styles.label}>
            Workspace name
            <input
              className={styles.input}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={suggestedName ? `${suggestedName}'s workspace` : 'Your workspace'}
              maxLength={255}
              required
              autoFocus
            />
          </label>
          <button className={styles.submitBtn} type="submit" disabled={saving}>
            {saving ? 'Creating workspace…' : 'Create workspace'}
          </button>
        </form>
      ) : (
        <form className={styles.form} onSubmit={joinWorkspace}>
          <label className={styles.label}>
            Invitation code
            <input
              className={styles.input}
              value={invitationCode}
              onChange={(event) => setInvitationCode(event.target.value.toUpperCase())}
              placeholder="OK-ACME-X7K29"
              maxLength={32}
              required
              autoFocus
            />
          </label>
          <button className={styles.submitBtn} type="submit" disabled={saving}>
            {saving ? 'Joining workspace…' : 'Join workspace'}
          </button>
        </form>
      )}
      <button className={styles.backButton} type="button" onClick={() => { setStep('CHOICE'); setError(''); }}>
        Back
      </button>
    </AuthLayout>
  );
}
