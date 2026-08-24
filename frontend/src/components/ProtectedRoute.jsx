import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { StethoscopeIcon } from './Icons';

export const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="page-loader-screen">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="brand-logo-icon" style={{ width: '48px', height: '48px' }}>
            <StethoscopeIcon size={26} />
          </div>
        </div>
        <div className="spinner spinner-dark" style={{ width: '28px', height: '28px', borderWidth: '3px' }}></div>
        <p style={{ color: 'var(--slate-500)', fontSize: '0.95rem', fontWeight: 500 }}>
          Authenticating MedSync session...
        </p>
      </div>
    );
  }

  // Not logged in -> Redirect to login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If specific roles required and user doesn't have required role -> Redirect to their respective dashboard
  if (allowedRoles && role && !allowedRoles.includes(role)) {
    if (role === 'DOCTOR') return <Navigate to="/doctor" replace />;
    if (role === 'PATIENT') return <Navigate to="/patient" replace />;
    if (role === 'ADMIN') return <Navigate to="/admin" replace />;
    return <Navigate to="/login" replace />;
  }

  return children;
};
