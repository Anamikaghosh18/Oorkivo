import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { authApi } from '../../services/api';
import styles from './AppShell.module.css';

export default function AppShell({ children, org, user }) {
  const [collapsed, setCollapsed] = useState(false);

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
    <div className={`${styles.shell} ${collapsed ? styles.shellCollapsed : ''}`}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <Topbar org={org} user={user} />
      <main className={styles.main}>
        {children}
      </main>
    </div>
  );
}
