import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import AuthLayout, { GoogleIcon } from '../components/auth/AuthLayout';
import styles from './AuthForms.module.css'; // Shared form styles

export default function Login({ onSuccess }) {
  const { login } = useAuth();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState(null);
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      if (onSuccess) onSuccess();
    } catch (err) {
      const status = err.response?.status;
      if (status === 401) setError('Invalid email or password.');
      else setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    // This would connect to your backend OAuth flow.
    alert("Google Sign-In integration would open here.");
  };

  return (
    <AuthLayout 
      title="Welcome back" 
      subtitle="Sign in to your workspace to continue."
    >
      {error && <div className={styles.error} role="alert">{error}</div>}

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.label}>
          Email
          <input
            type="email"
            className={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
            autoFocus
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
          />
        </label>
        
        <div className={styles.formActions}>
          <a href="#" className={styles.forgotLink}>Forgot password?</a>
        </div>

        <button type="submit" className={styles.submitBtn} disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className={styles.divider}>
        <span>or</span>
      </div>

      <button type="button" className={styles.googleBtn} onClick={handleGoogleSignIn}>
        <GoogleIcon />
        Sign in with Google
      </button>

      <p className={styles.switchPrompt}>
        Don't have an account? <Link to="/signup" className={styles.switchLink}>Sign up</Link>
      </p>
    </AuthLayout>
  );
}
