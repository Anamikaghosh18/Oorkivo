import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Dashboard  from './pages/Dashboard';
import Projects   from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Tasks      from './pages/Tasks';
import Teams      from './pages/Teams';
import TaskDetail from './pages/TaskDetail';
import Login      from './pages/Login';
import Signup     from './pages/Signup';
import './index.css';

function RequireAuth({ children }) {
  const token = localStorage.getItem('access_token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* Protected */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        <Route path="/dashboard" element={
          <RequireAuth><Dashboard /></RequireAuth>
        }/>

        <Route path="/projects" element={
          <RequireAuth><Projects /></RequireAuth>
        }/>
        <Route path="/projects/:id" element={
          <RequireAuth><ProjectDetail /></RequireAuth>
        }/>

        <Route path="/tasks/:id" element={
          <RequireAuth><TaskDetail /></RequireAuth>
        }/>

        {/* Remaining stub routes */}
        <Route path="/teams"    element={<RequireAuth><Teams /></RequireAuth>} />
        <Route path="/tasks"    element={<RequireAuth><Tasks /></RequireAuth>} />
        <Route path="/members"  element={<RequireAuth><Placeholder label="Members" /></RequireAuth>} />
        <Route path="/activity" element={<RequireAuth><Placeholder label="Activity" /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><Placeholder label="Settings" /></RequireAuth>} />
        <Route path="*"         element={<Placeholder label="404 — Page not found" />} />
      </Routes>
    </BrowserRouter>
  );
}

function Placeholder({ label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', fontFamily: 'Inter, sans-serif',
      fontSize: 14, color: '#737873',
    }}>
      {label} — coming soon
    </div>
  );
}
