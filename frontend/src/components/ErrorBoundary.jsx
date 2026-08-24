import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('UI Render Error caught by ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--slate-50, #f8fafc)',
            padding: '2rem',
            fontFamily: 'inherit',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '2.5rem',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)',
              textAlign: 'center',
              border: '1px solid var(--slate-200, #e2e8f0)',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: '#fef2f2',
                color: '#ef4444',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem',
                marginBottom: '1rem',
              }}
            >
              ⚠️
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--slate-900, #0f172a)', margin: '0 0 0.5rem 0' }}>
              Something went wrong loading this view
            </h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--slate-600, #475569)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              {this.state.error?.message || 'An unexpected rendering error occurred. Please refresh or return to your dashboard.'}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.href = '/patient';
                }}
                style={{
                  padding: '0.7rem 1.4rem',
                  background: '#0d9488',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                }}
              >
                Back to Patient Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
