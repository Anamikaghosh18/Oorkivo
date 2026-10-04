import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { authApi } from '../../services/api';
import styles from './OverlayDetailShell.module.css';

export default function OverlayDetailShell({
  centerTitle,
  ariaLabel,
  onClose,
  backLabel = 'Back to workspace',
  wide = false,
  children,
}) {
  useEffect(() => {
    let active = true;
    let mediaQuery;
    let updateTheme;

    authApi.preferences().then(({ data }) => {
      if (!active) return;
      const applyTheme = () => {
        const isDark = data.theme === 'DARK'
          || (data.theme === 'SYSTEM' && mediaQuery?.matches);
        document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
      };
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      updateTheme = applyTheme;
      applyTheme();
      if (data.theme === 'SYSTEM') mediaQuery.addEventListener('change', updateTheme);
    }).catch((error) => {
      console.error('Unable to load appearance preferences.', error);
    });

    return () => {
      active = false;
      if (mediaQuery && updateTheme) mediaQuery.removeEventListener('change', updateTheme);
    };
  }, []);

  return (
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className={`${styles.surface} ${wide ? styles.surfaceWide : ''}`} role="dialog" aria-modal="true" aria-label={ariaLabel}>
        <header className={styles.topbar}>
          <button type="button" className={styles.brand} onClick={onClose}>
            <span className={styles.logo} aria-hidden="true">O</span>
            <span>Oorkivo</span>
          </button>
          {centerTitle ? <span className={styles.centerTitle}>{centerTitle}</span> : <span aria-hidden="true" />}
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={backLabel}>
            <ArrowLeft size={16} />
            <span>{backLabel}</span>
          </button>
        </header>
        <div className={styles.body}>{children}</div>
      </section>
    </div>
  );
}
