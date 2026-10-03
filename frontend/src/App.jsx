import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import TaskDetail from './pages/TaskDetail';
import './index.css';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/tasks/:id" element={<TaskDetail />} />

        {/* Placeholder routes — pages to be built next */}
        <Route path="/teams"    element={<Placeholder label="Teams" />} />
        <Route path="/projects" element={<Placeholder label="Projects" />} />
        <Route path="/tasks"    element={<Placeholder label="Tasks" />} />
        <Route path="/members"  element={<Placeholder label="Members" />} />
        <Route path="/activity" element={<Placeholder label="Activity" />} />
        <Route path="/settings" element={<Placeholder label="Settings" />} />
        <Route path="*"         element={<Placeholder label="404 — Page not found" />} />
      </Routes>
    </BrowserRouter>
  );
}

function Placeholder({ label }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      fontFamily: 'Inter, sans-serif',
      fontSize: 14,
      color: '#737873',
    }}>
      {label} — coming soon
    </div>
  );
}
