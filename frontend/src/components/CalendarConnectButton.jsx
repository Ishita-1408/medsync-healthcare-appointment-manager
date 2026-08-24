import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { CalendarIcon, CheckCircleIcon, XIcon, RefreshCwIcon } from './Icons';

export const CalendarConnectButton = ({ style = {} }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [status, setStatus] = useState({ isConnected: false, googleEmail: null, updatedAt: null });
  const [notice, setNotice] = useState({ type: '', msg: '' });

  const backendUrl = import.meta.env.VITE_API_URL || '/api';

  // ── 1. Check Connection Status against Backend & DB ──
  const fetchStatus = useCallback(async () => {
    if (!user?.id) return;
    try {
      // Primary: Check via backend API with authenticated Supabase JWT
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (token) {
        const res = await fetch(`${backendUrl}/calendar/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const resJson = await res.json();
          if (resJson.success) {
            setStatus({
              isConnected: Boolean(resJson.isConnected),
              googleEmail: resJson.googleEmail || null,
              updatedAt: resJson.updatedAt || null,
            });
            return;
          }
        }
      }

      // Secondary Fallback: Direct DB query via Supabase Client
      const { data: dbData } = await supabase
        .from('user_calendar_tokens')
        .select('is_connected, google_email, updated_at')
        .eq('user_id', user.id)
        .maybeSingle();

      if (dbData) {
        setStatus({
          isConnected: Boolean(dbData.is_connected),
          googleEmail: dbData.google_email || null,
          updatedAt: dbData.updated_at || null,
        });
      }
    } catch (err) {
      console.warn('Could not verify calendar status:', err);
    }
  }, [user?.id, backendUrl]);

  useEffect(() => {
    fetchStatus();

    // Check URL query parameters for OAuth return redirect
    const params = new URLSearchParams(window.location.search);
    if (params.get('calendar_connected') === 'true') {
      setNotice({ type: 'success', msg: 'Google Calendar successfully connected to your account!' });
      setStatus((prev) => ({ ...prev, isConnected: true }));
      fetchStatus();
      setTimeout(() => {
        window.history.replaceState({}, document.title, window.location.pathname);
      }, 1500);
    } else if (params.get('calendar_error')) {
      setNotice({ type: 'error', msg: `Google Calendar connection failed: ${params.get('calendar_error')}` });
      setTimeout(() => {
        window.history.replaceState({}, document.title, window.location.pathname);
      }, 1500);
    }
  }, [fetchStatus]);

  // ── 2. Connect Calendar (Launch Per-User OAuth) ──
  const handleConnect = async () => {
    setLoading(true);
    setNotice({ type: '', msg: '' });
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        throw new Error('Please log in to connect Google Calendar.');
      }

      const returnPath = encodeURIComponent(window.location.pathname || '/');
      const res = await fetch(`${backendUrl}/calendar/auth?returnPath=${returnPath}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      let resJson;
      try {
        resJson = await res.json();
      } catch {
        throw new Error('Could not connect to MedSync backend server. Please verify backend is running on port 5000.');
      }

      if (!res.ok || !resJson?.authUrl) {
        throw new Error(resJson?.error || 'Failed to initiate Google OAuth flow.');
      }

      // Redirect user to Google OAuth consent page
      window.location.href = resJson.authUrl;
    } catch (err) {
      console.error('Connect calendar error:', err);
      setNotice({
        type: 'error',
        msg: err.message || 'Could not start Google authorization. Ensure backend is running.',
      });
      setLoading(false);
    }
  };

  // ── 3. Manual Sync All Appointments ──
  const handleSyncAll = async () => {
    setSyncing(true);
    setNotice({ type: '', msg: '' });
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) throw new Error('Session expired. Please log in.');

      const res = await fetch(`${backendUrl}/calendar/sync-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const resJson = await res.json();
      if (res.ok && resJson.success) {
        setNotice({
          type: 'success',
          msg: resJson.message || 'Appointments synchronized to your Google Calendar.',
        });
        fetchStatus();
      } else {
        throw new Error(resJson.error || 'Failed to synchronize appointments.');
      }
    } catch (err) {
      setNotice({ type: 'error', msg: err.message });
    } finally {
      setSyncing(false);
    }
  };

  // ── 4. Disconnect Calendar ──
  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect your Google Calendar? MedSync appointments will remain unaffected.')) return;
    setLoading(true);
    setNotice({ type: '', msg: '' });
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (token) {
        await fetch(`${backendUrl}/calendar/disconnect`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      // Also update DB directly
      await supabase
        .from('user_calendar_tokens')
        .update({ is_connected: false, access_token: null, refresh_token: null })
        .eq('user_id', user.id);

      setStatus({ isConnected: false, googleEmail: null, updatedAt: null });
      setShowSettings(false);
      setNotice({ type: 'success', msg: 'Google Calendar disconnected from your MedSync account.' });
    } catch (err) {
      console.error('Disconnect error:', err);
      setNotice({ type: 'error', msg: 'Failed to disconnect Google Calendar.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', gap: '0.35rem', ...style }}>
      {notice.msg && (
        <div
          style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            padding: '0.3rem 0.6rem',
            borderRadius: '6px',
            background: notice.type === 'success' ? '#f0fdfa' : '#fef2f2',
            color: notice.type === 'success' ? '#0f766e' : '#b91c1c',
            border: `1px solid ${notice.type === 'success' ? '#ccfbf1' : '#fecaca'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            maxWidth: '320px',
          }}
        >
          <span>{notice.msg}</span>
          <button
            onClick={() => setNotice({ type: '', msg: '' })}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}
          >
            <XIcon size={12} />
          </button>
        </div>
      )}

      {status.isConnected ? (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          {/* Main Connected Badge */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              background: '#ffffff',
              border: '1.5px solid #86efac',
              borderRadius: '10px',
              padding: '0.35rem 0.75rem',
              boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 700,
              color: '#15803d',
              transition: 'all 0.15s ease',
            }}
          >
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#16a34a' }}></span>
            <span>Google Calendar {status.googleEmail ? `(${status.googleEmail})` : 'Connected'}</span>
          </button>

          {/* Settings / Actions Dropdown Modal */}
          {showSettings && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '6px',
                width: '280px',
                background: '#ffffff',
                border: '1.5px solid var(--border-card)',
                borderRadius: '12px',
                padding: '1rem',
                boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                  Google Calendar Settings
                </div>
                <button
                  onClick={() => setShowSettings(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                >
                  <XIcon size={14} />
                </button>
              </div>

              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', background: 'var(--bg-app)', padding: '0.5rem 0.65rem', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Status:</span>
                  <span style={{ fontWeight: 700, color: '#16a34a' }}>● Connected</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Account:</span>
                  <span style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}>
                    {status.googleEmail || 'Primary Account'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Target:</span>
                  <span style={{ fontWeight: 600 }}>Primary Calendar</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  onClick={handleSyncAll}
                  disabled={syncing}
                  style={{
                    flex: 1,
                    padding: '0.45rem',
                    borderRadius: '6px',
                    border: '1px solid var(--blue-200)',
                    background: 'var(--blue-50)',
                    color: 'var(--blue-700)',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    cursor: syncing ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.35rem',
                  }}
                >
                  <RefreshCwIcon size={12} />
                  <span>{syncing ? 'Syncing...' : 'Sync Now'}</span>
                </button>

                <button
                  onClick={handleDisconnect}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '0.45rem',
                    borderRadius: '6px',
                    border: '1px solid #fecaca',
                    background: '#fef2f2',
                    color: '#b91c1c',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {loading ? '...' : 'Disconnect'}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={handleConnect}
          disabled={loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            background: '#ffffff',
            color: '#1e293b',
            border: '1.5px solid var(--slate-300)',
            borderRadius: '10px',
            padding: '0.45rem 0.85rem',
            fontSize: '0.82rem',
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
            transition: 'all 0.15s ease',
          }}
          title="Connect Google Calendar to automatically synchronize your MedSync consultations"
        >
          <CalendarIcon size={16} style={{ color: '#2563eb' }} />
          <span>{loading ? 'Connecting...' : 'Connect Google Calendar'}</span>
        </button>
      )}
    </div>
  );
};

