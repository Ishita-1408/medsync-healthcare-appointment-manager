import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  BellIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  CalendarIcon,
  FileTextIcon,
  ClockIcon,
  XIcon,
} from './Icons';

const NOTIF_ICONS = {
  APPOINTMENT_BOOKED: { icon: CalendarIcon, color: '#0d9488', bg: '#f0fdfa' },
  APPOINTMENT_CONFIRMED: { icon: CheckCircleIcon, color: '#16a34a', bg: '#dcfce7' },
  APPOINTMENT_CANCELLED: { icon: AlertCircleIcon, color: '#b91c1c', bg: '#fee2e2' },
  APPOINTMENT_REMINDER_24H: { icon: ClockIcon, color: '#2563eb', bg: '#eff6ff' },
  APPOINTMENT_REMINDER_2H: { icon: ClockIcon, color: '#d97706', bg: '#fef3c7' },
  INTAKE_REMINDER: { icon: FileTextIcon, color: '#0f766e', bg: '#ccfbf1' },
  PRESCRIPTION_ISSUED: { icon: FileTextIcon, color: '#7e22ce', bg: '#f3e8ff' },
  FOLLOW_UP_REMINDER: { icon: CalendarIcon, color: '#4338ca', bg: '#e0e7ff' },
};

function formatRelativeTime(iso) {
  if (!iso) return '';
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const NotificationCenter = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef(null);

  // ── Fetch Notifications ──
  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    try {
      // First process scheduled reminders if any are due
      try {
        await supabase.rpc('process_scheduled_reminders');
      } catch {
        // optional
      }

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['SENT', 'READ', 'PENDING'])
        .order('created_at', { ascending: false })
        .limit(30);

      if (!error && data) {
        setNotifications(data);
        const unread = data.filter((n) => n.status === 'SENT').length;
        setUnreadCount(unread);
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // 30s poll
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Click outside listener to close dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // ── Mark Single Notification as Read ──
  const handleMarkAsRead = async (notifId) => {
    try {
      // Try RPC first
      try {
        await supabase.rpc('mark_notification_as_read', { p_notification_id: notifId });
      } catch {
        // Fallback to table update
        await supabase
          .from('notifications')
          .update({ status: 'READ', read_at: new Date().toISOString() })
          .eq('id', notifId)
          .eq('user_id', user.id);
      }

      setNotifications((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, status: 'READ', read_at: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Mark read error:', err);
    }
  };

  // ── Mark All Notifications as Read ──
  const handleMarkAllRead = async () => {
    try {
      try {
        await supabase.rpc('mark_all_notifications_as_read');
      } catch {
        await supabase
          .from('notifications')
          .update({ status: 'READ', read_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .neq('status', 'READ');
      }

      setNotifications((prev) =>
        prev.map((n) => ({ ...n, status: 'READ', read_at: new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch (err) {
      console.error('Mark all read error:', err);
    }
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Bell Button */}
      <button
        onClick={() => {
          setOpen(!open);
          if (!open) fetchNotifications();
        }}
        style={{
          position: 'relative',
          background: open ? 'var(--slate-100)' : 'transparent',
          border: '1.5px solid var(--slate-200)',
          borderRadius: '10px',
          padding: '0.45rem',
          cursor: 'pointer',
          color: 'var(--slate-700)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s',
        }}
        title="Notifications"
      >
        <BellIcon size={20} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              background: '#ef4444',
              color: '#ffffff',
              fontSize: '0.7rem',
              fontWeight: 800,
              borderRadius: '999px',
              minWidth: '18px',
              height: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              boxShadow: '0 2px 4px rgba(239, 68, 68, 0.4)',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Floating Notification Dropdown */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '360px',
            maxHeight: '480px',
            background: '#ffffff',
            borderRadius: '14px',
            boxShadow: '0 20px 40px -8px rgba(0, 0, 0, 0.2), 0 0 1px 1px rgba(0, 0, 0, 0.05)',
            border: '1px solid var(--slate-200)',
            zIndex: 1001,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.85rem 1rem',
              background: '#f8fafc',
              borderBottom: '1px solid var(--slate-200)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <strong style={{ fontSize: '0.92rem', color: 'var(--slate-900)' }}>Notifications</strong>
              {unreadCount > 0 && (
                <span
                  style={{
                    background: '#fef2f2',
                    color: '#b91c1c',
                    border: '1px solid #fecaca',
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    padding: '0.1rem 0.4rem',
                    borderRadius: '999px',
                  }}
                >
                  {unreadCount} new
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0d9488',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: '0.2rem 0.4rem',
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notification Items List */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '0.25rem 0' }}>
            {notifications.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1.5rem', color: 'var(--slate-400)' }}>
                <BellIcon size={28} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                <p style={{ fontSize: '0.85rem', margin: 0 }}>No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => {
                const conf = NOTIF_ICONS[n.type] || NOTIF_ICONS.APPOINTMENT_BOOKED;
                const IconComponent = conf.icon;
                const isUnread = n.status === 'SENT';

                return (
                  <div
                    key={n.id}
                    onClick={() => isUnread && handleMarkAsRead(n.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.75rem',
                      padding: '0.8rem 1rem',
                      borderBottom: '1px solid var(--slate-100)',
                      background: isUnread ? '#f0fdfa' : '#ffffff',
                      cursor: isUnread ? 'pointer' : 'default',
                      transition: 'background 0.15s',
                    }}
                  >
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: conf.bg,
                        color: conf.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: '2px',
                      }}
                    >
                      <IconComponent size={16} />
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: isUnread ? 'var(--slate-900)' : 'var(--slate-700)' }}>
                          {n.title}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--slate-400)' }}>
                          {formatRelativeTime(n.created_at)}
                        </span>
                      </div>

                      <p style={{ fontSize: '0.78rem', color: 'var(--slate-600)', margin: '0.2rem 0 0', lineHeight: 1.35 }}>
                        {n.message}
                      </p>
                    </div>

                    {isUnread && (
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: '#0d9488',
                          flexShrink: 0,
                          marginTop: '6px',
                        }}
                      ></span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
