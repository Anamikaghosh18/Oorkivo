import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AuthLayout from '../components/auth/AuthLayout';
import { authApi } from '../services/api';
import styles from './AuthForms.module.css';

export default function InvitationAcceptance() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [message, setMessage] = useState('Accepting your invitation…');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!token) {
      setError('This invitation link is missing its token.');
      return () => { active = false; };
    }
    if (!localStorage.getItem('access_token')) {
      setMessage('Sign in or create an account with the invited email address to continue.');
      return () => { active = false; };
    }
    authApi.acceptInvitation(token).then(({ data }) => {
      if (!active) return;
      localStorage.setItem('current_organization_id', String(data.organization_id));
      window.location.assign('/dashboard');
    }).catch((acceptError) => {
      if (!active) return;
      const detail = acceptError.response?.data?.detail ?? acceptError.response?.data?.token;
      setError(Array.isArray(detail) ? detail[0] : (detail || 'This invitation could not be accepted.'));
    });
    return () => { active = false; };
  }, [token]);

  const inviteQuery = `?invite=${encodeURIComponent(token ?? '')}`;
  return (
    <AuthLayout title="Join your workspace" subtitle={error || message}>
      {error && <div className={styles.error} role="alert">{error}</div>}
      {!localStorage.getItem('access_token') && token && (
        <div className={styles.form}>
          <Link className={styles.submitBtn} to={`/login${inviteQuery}`}>Sign in</Link>
          <Link className={styles.googleBtn} to={`/signup${inviteQuery}`}>Create an account</Link>
        </div>
      )}
    </AuthLayout>
  );
}
