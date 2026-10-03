import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import AuthLayout, { GoogleIcon } from '../components/auth/AuthLayout';
import { authApi } from '../services/api';
import styles from './AuthForms.module.css'; // Shared form styles

export default function Signup() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  
  const [error,   setError]   = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // The backend requires a 'username' field. We generate it from the email prefix.
      const username = email.split('@')[0] + Math.floor(Math.random() * 10000);
      await register({ username, email, password, first_name: firstName, last_name: lastName });
      const invitationToken = searchParams.get('invite');
      if (invitationToken) {
        const response = await authApi.acceptInvitation(invitationToken);
        localStorage.setItem('current_organization_id', String(response.data.organization_id));
        navigate('/dashboard');
      } else {
        navigate('/onboarding');
      }
    } catch (err) {
      const data = err.response?.data;
      if (data && typeof data === 'object' && !data.detail) {
        // Extract the first validation error message
        const firstKey = Object.keys(data)[0];
        const firstError = data[firstKey];
        setError(`${firstKey}: ${Array.isArray(firstError) ? firstError[0] : firstError}`);
      } else {
        setError(data?.detail || 'Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = () => {
    alert("Google Sign-Up integration would open here.");
  };

  return (
    <AuthLayout
      variant="auth"
      title="Create an account" 
      subtitle="Get your team’s work into one clear view."
    >
      <div className={styles.authCompact}>
      {error && <div className={styles.error} role="alert">{error}</div>}

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.row}>
          <label className={styles.label}>
            First name
            <input
              type="text"
              className={styles.input}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Jane"
              required
              autoFocus
            />
          </label>
          <label className={styles.label}>
            Last name
            <input
              type="text"
              className={styles.input}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Doe"
              required
            />
          </label>
        </div>

        <label className={styles.label}>
          Work email
          <input
            type="email"
            className={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@company.com"
            required
          />
        </label>
        
        <label className={styles.label}>
          Password
          <input
            type="password"
            className={styles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={8}
          />
        </label>

        <button type="submit" className={styles.submitBtn} disabled={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <div className={styles.divider}>
        <span>or</span>
      </div>

      <button type="button" className={styles.googleBtn} onClick={handleGoogleSignUp}>
        <GoogleIcon />
        Sign up with Google
      </button>

      <p className={styles.switchPrompt}>
        Already have an account? <Link to={`/login${searchParams.get('invite') ? `?invite=${encodeURIComponent(searchParams.get('invite'))}` : ''}`} className={styles.switchLink}>Sign in</Link>
      </p>
      </div>
    </AuthLayout>
  );
}
