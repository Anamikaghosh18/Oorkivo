import { useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import styles from './AppShell.module.css';

export default function AppShell({ children, org, user }) {
  const [collapsed, setCollapsed] = useState(false);

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
