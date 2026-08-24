import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { StethoscopeIcon, LogOutIcon, UserIcon } from './Icons';
import { NotificationCenter } from './NotificationCenter';
import { CalendarConnectButton } from './CalendarConnectButton';

export const Navbar = () => {
  const { profile, role, logout } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setLoggingOut(false);
    }
  };

  const roleLabel =
    role === 'DOCTOR'
      ? 'Doctor Portal'
      : role === 'ADMIN'
      ? 'Admin Console'
      : 'Patient Portal';

  const userInitials = profile
    ? `${profile.first_name?.[0] || ''}${profile.last_name?.[0] || ''}`.toUpperCase()
    : 'U';

  const homePath = role === 'DOCTOR' ? '/doctor' : role === 'ADMIN' ? '/admin' : '/patient';

  return (
    <header className="saas-topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Link to={homePath} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', textDecoration: 'none' }}>
          <div className="brand-logo-icon" style={{ width: '36px', height: '36px' }}>
            <StethoscopeIcon size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--blue-900)', fontFamily: 'var(--font-heading)' }}>
              MedSync
            </div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--blue-600)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {roleLabel}
            </div>
          </div>
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <CalendarConnectButton />
        <NotificationCenter />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.35rem 0.85rem',
            background: 'var(--blue-50)',
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--blue-100)',
          }}
        >
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--blue-600) 0%, var(--blue-800) 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '0.9rem',
              fontFamily: 'var(--font-heading)',
            }}
          >
            {userInitials || <UserIcon size={16} />}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.2 }}>
              {profile ? `${profile.first_name} ${profile.last_name}` : 'User'}
            </span>
            <span style={{ fontSize: '0.74rem', color: 'var(--blue-700)', fontWeight: 700 }}>
              {role || 'PATIENT'}
            </span>
          </div>
        </div>

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="btn btn-secondary"
          style={{ padding: '0.45rem 0.95rem', fontSize: '0.88rem', minHeight: '36px' }}
          title="Sign out of MedSync"
        >
          {loggingOut ? (
            <div className="spinner spinner-dark" style={{ width: '14px', height: '14px' }}></div>
          ) : (
            <LogOutIcon size={16} />
          )}
          <span>Sign Out</span>
        </button>
      </div>
    </header>
  );
};
