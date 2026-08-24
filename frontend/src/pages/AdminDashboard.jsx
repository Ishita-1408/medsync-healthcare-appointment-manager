import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navbar } from '../components/Navbar';
import {
  ShieldIcon,
  UserIcon,
  ActivityIcon,
  StethoscopeIcon,
  PhoneIcon,
  MailIcon,
} from '../components/Icons';
import { supabase } from '../lib/supabase';

export const AdminDashboard = () => {
  const { user, profile } = useAuth();

  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState('');

  useEffect(() => {
    const loadUsers = async () => {
      setLoadingUsers(true);
      setUsersError('');

      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, role, phone_number, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to load users:', error);
        setUsersError(error.message);
        setUsers([]);
      } else {
        setUsers(data || []);
      }

      setLoadingUsers(false);
    };

    loadUsers();
  }, []);

  const totalUsers = users.length;
  const totalPatients = users.filter((u) => u.role === 'PATIENT').length;
  const totalDoctors = users.filter((u) => u.role === 'DOCTOR').length;
  const totalAdmins = users.filter((u) => u.role === 'ADMIN').length;

  return (
    <div className="dashboard-layout">
      <Navbar />

      <main className="dashboard-main">
        {/* Welcome Banner — Medical Teal */}
        <div
          className="dashboard-welcome-banner"
          style={{
            background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 60%, #115e59 100%)',
          }}
        >
          <div>
            <h1>MedSync Administration Console</h1>
            <p>
              Welcome, {profile?.first_name || 'Administrator'}{' '}
              {profile?.last_name || ''} • Central platform governance & controls
            </p>
          </div>

          <div>
            <span
              style={{
                fontSize: '0.85rem',
                fontWeight: 700,
                padding: '0.4rem 0.9rem',
                borderRadius: 'var(--radius-full)',
                background: 'rgba(255, 255, 255, 0.2)',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.3)',
              }}
            >
              ADMIN CONSOLE ACTIVE
            </span>
          </div>
        </div>

        {/* Statistics Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '0.85rem',
            marginBottom: '1.25rem',
          }}
        >
          {/* Card 1: Total Users — Light Blue */}
          <div className="dashboard-card" style={{ padding: '1rem 1.25rem', borderLeft: '4px solid #3b82f6' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Total Users
              </span>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#eff6ff', color: '#1d4ed8' }}>
                ALL
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-heading)' }}>
                {loadingUsers ? '—' : totalUsers}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>registered accounts</span>
            </div>
            <div style={{ fontSize: '0.82rem', color: '#2563eb', fontWeight: 600, marginTop: '0.25rem' }}>
              Verified clinical & patient identities
            </div>
          </div>

          {/* Card 2: Patients — Emerald Green */}
          <div className="dashboard-card" style={{ padding: '1rem 1.25rem', borderLeft: '4px solid #10b981' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Patients
              </span>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#ecfdf5', color: '#047857' }}>
                PATIENT
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-heading)' }}>
                {loadingUsers ? '—' : totalPatients}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>registered patients</span>
            </div>
            <div style={{ fontSize: '0.82rem', color: '#059669', fontWeight: 600, marginTop: '0.25rem' }}>
              Active patient portals
            </div>
          </div>

          {/* Card 3: Doctors — Light Orange / Amber */}
          <div className="dashboard-card" style={{ padding: '1rem 1.25rem', borderLeft: '4px solid #f59e0b' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Doctors
              </span>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#fffbeb', color: '#b45309' }}>
                DOCTOR
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-heading)' }}>
                {loadingUsers ? '—' : totalDoctors}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>specialists</span>
            </div>
            <div style={{ fontSize: '0.82rem', color: '#d97706', fontWeight: 600, marginTop: '0.25rem' }}>
              Licensed physicians & practitioners
            </div>
          </div>

          {/* Card 4: Administrators — Light Purple */}
          <div className="dashboard-card" style={{ padding: '1rem 1.25rem', borderLeft: '4px solid #8b5cf6' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Administrators
              </span>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#f5f3ff', color: '#6d28d9' }}>
                ADMIN
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-heading)' }}>
                {loadingUsers ? '—' : totalAdmins}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>system admins</span>
            </div>
            <div style={{ fontSize: '0.82rem', color: '#7c3aed', fontWeight: 600, marginTop: '0.25rem' }}>
              Platform governance operators
            </div>
          </div>
        </div>

        {/* Existing dashboard cards */}
        <div className="dashboard-grid">
          {/* Admin Profile Details */}
          <div className="dashboard-card">
            <div className="card-header-with-icon">
              <div
                className="card-icon-wrapper"
                style={{ background: '#ede9fe', color: '#6d28d9' }}
              >
                <ShieldIcon size={20} />
              </div>

              <div>
                <h3 style={{ fontSize: '1.1rem' }}>
                  Administrator Profile
                </h3>

                <p
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--slate-500)',
                  }}
                >
                  Account & authorization level
                </p>
              </div>
            </div>

            <div className="info-item">
              <span className="info-label">Full Name</span>
              <span className="info-value">
                {profile?.first_name} {profile?.last_name}
              </span>
            </div>

            <div className="info-item">
              <span className="info-label">Email</span>
              <span className="info-value">{user?.email || 'N/A'}</span>
            </div>

            <div className="info-item">
              <span className="info-label">Phone</span>
              <span className="info-value">
                {profile?.phone_number || 'Not provided'}
              </span>
            </div>

            <div className="info-item">
              <span className="info-label">System Role</span>
              <span
                className="info-value"
                style={{ color: '#6d28d9', fontWeight: 700 }}
              >
                {profile?.role || 'ADMIN'}
              </span>
            </div>

            <div className="info-item">
              <span className="info-label">Admin UUID</span>
              <span
                className="info-value"
                style={{
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                }}
              >
                {user?.id?.substring(0, 12)}...
              </span>
            </div>
          </div>

          {/* Infrastructure Health */}
          <div className="dashboard-card">
            <div className="card-header-with-icon">
              <div className="card-icon-wrapper blue">
                <ActivityIcon size={20} />
              </div>

              <div>
                <h3 style={{ fontSize: '1.1rem' }}>
                  Infrastructure Health
                </h3>

                <p
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--slate-500)',
                  }}
                >
                  Services & security controls
                </p>
              </div>
            </div>

            <div className="info-item">
              <span className="info-label">Supabase Auth</span>
              <span
                className="info-value"
                style={{ color: '#16a34a' }}
              >
                ● Operational (Email)
              </span>
            </div>

            <div className="info-item">
              <span className="info-label">PostgreSQL Database</span>
              <span
                className="info-value"
                style={{ color: '#16a34a' }}
              >
                ● Connected
              </span>
            </div>

            <div className="info-item">
              <span className="info-label">Row Level Security</span>
              <span
                className="info-value"
                style={{ color: '#16a34a' }}
              >
                ● Active & Enforced
              </span>
            </div>

            <div className="info-item">
              <span className="info-label">Auth Trigger</span>
              <span
                className="info-value"
                style={{ color: '#16a34a' }}
              >
                ● handle_new_user() active
              </span>
            </div>
          </div>

          {/* Platform Governance */}
          <div className="dashboard-card">
            <div className="card-header-with-icon">
              <div className="card-icon-wrapper teal">
                <StethoscopeIcon size={20} />
              </div>

              <div>
                <h3 style={{ fontSize: '1.1rem' }}>
                  Platform Governance
                </h3>

                <p
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--slate-500)',
                  }}
                >
                  User management & operations
                </p>
              </div>
            </div>

            <div
              style={{
                background: 'var(--slate-50)',
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                border: '1px dashed var(--slate-300)',
                textAlign: 'center',
              }}
            >
              <p
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--slate-600)',
                  lineHeight: 1.5,
                }}
              >
                User statistics and management tools are now connected
                to the MedSync profiles database.
              </p>
            </div>
          </div>
        </div>

        {/* User Management */}
        <div
          className="dashboard-card"
          style={{
            marginTop: '1.5rem',
            overflow: 'hidden',
          }}
        >
          <div className="card-header-with-icon">
            <div
              className="card-icon-wrapper"
              style={{ background: '#dbeafe', color: '#2563eb' }}
            >
              <UserIcon size={20} />
            </div>

            <div>
              <h3 style={{ fontSize: '1.1rem' }}>User Management</h3>

              <p
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--slate-500)',
                }}
              >
                All registered MedSync users
              </p>
            </div>
          </div>

          {loadingUsers && (
            <div
              style={{
                padding: '2rem',
                textAlign: 'center',
                color: 'var(--slate-500)',
              }}
            >
              Loading users...
            </div>
          )}

          {usersError && (
            <div
              style={{
                marginTop: '1rem',
                padding: '1rem',
                borderRadius: '8px',
                background: '#fef2f2',
                color: '#b91c1c',
                border: '1px solid #fecaca',
              }}
            >
              Unable to load users: {usersError}
            </div>
          )}

          {!loadingUsers && !usersError && (
            <div
              style={{
                overflowX: 'auto',
                marginTop: '1rem',
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  minWidth: '800px',
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: 'var(--slate-50)',
                      borderBottom: '1px solid var(--slate-200)',
                    }}
                  >
                    <th style={tableHeaderStyle}>Name</th>
                    <th style={tableHeaderStyle}>User ID</th>
                    <th style={tableHeaderStyle}>Phone</th>
                    <th style={tableHeaderStyle}>Role</th>
                    <th style={tableHeaderStyle}>Created</th>
                  </tr>
                </thead>

                <tbody>
                  {users.map((item) => (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom:
                          '1px solid var(--slate-100)',
                      }}
                    >
                      <td style={tableCellStyle}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.6rem',
                          }}
                        >
                          <UserIcon size={18} />

                          <strong>
                            {item.first_name} {item.last_name}
                          </strong>
                        </div>
                      </td>

                      <td
                        style={{
                          ...tableCellStyle,
                          fontFamily: 'monospace',
                          fontSize: '0.75rem',
                          color: 'var(--slate-500)',
                        }}
                      >
                        {item.id.substring(0, 12)}...
                      </td>

                      <td style={tableCellStyle}>
                        {item.phone_number ? (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                            }}
                          >
                            <PhoneIcon size={15} />
                            {item.phone_number}
                          </div>
                        ) : (
                          'Not provided'
                        )}
                      </td>

                      <td style={tableCellStyle}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.3rem 0.65rem',
                            borderRadius: '999px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            background:
                              item.role === 'ADMIN'
                                ? '#ede9fe'
                                : item.role === 'DOCTOR'
                                  ? '#fef3c7'
                                  : '#dbeafe',
                            color:
                              item.role === 'ADMIN'
                                ? '#6d28d9'
                                : item.role === 'DOCTOR'
                                  ? '#b45309'
                                  : '#1d4ed8',
                          }}
                        >
                          {item.role}
                        </span>
                      </td>

                      <td style={tableCellStyle}>
                        {item.created_at
                          ? new Date(
                            item.created_at
                          ).toLocaleDateString()
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {users.length === 0 && (
                <div
                  style={{
                    padding: '2rem',
                    textAlign: 'center',
                    color: 'var(--slate-500)',
                  }}
                >
                  No users found.
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

const tableHeaderStyle = {
  textAlign: 'left',
  padding: '0.85rem 1rem',
  fontSize: '0.75rem',
  fontWeight: 700,
  color: 'var(--slate-600)',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
};

const tableCellStyle = {
  padding: '0.9rem 1rem',
  fontSize: '0.85rem',
  color: 'var(--slate-700)',
};