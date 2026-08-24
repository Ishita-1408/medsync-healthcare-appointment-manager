import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  StethoscopeIcon,
  MailIcon,
  LockIcon,
  EyeIcon,
  EyeOffIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  ShieldIcon,
  CalendarIcon,
  ClockIcon,
  CheckIcon,
} from '../components/Icons';

export const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Check if redirected with a message (e.g., registration success)
  const successMsg = location.state?.message || '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email.trim() || !password) {
      setErrorMsg('Please provide both your email address and password.');
      return;
    }

    setLoading(true);

    try {
      const { profile } = await login(email, password);

      // Route based on role
      const userRole = profile?.role;
      if (userRole === 'DOCTOR') {
        navigate('/doctor', { replace: true });
      } else if (userRole === 'ADMIN') {
        navigate('/admin', { replace: true });
      } else {
        navigate('/patient', { replace: true });
      }
    } catch (err) {
      console.error('Login submission error:', err);
      if (err.message && err.message.includes('Invalid login credentials')) {
        setErrorMsg('Invalid email or password. Please check your credentials.');
      } else if (err.message && err.message.includes('Email not confirmed')) {
        setErrorMsg('Your email has not been confirmed yet. Please check your inbox for the confirmation link.');
      } else {
        setErrorMsg(err.message || 'Failed to sign in. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-wrapper">
      <div className="auth-container">
        {/* Left Side Brand Showcase Panel (~52% width) */}
        <div className="auth-left-panel">
          <div className="auth-brand-header">
            <div className="auth-brand-logo">
              <StethoscopeIcon size={24} />
            </div>
            <div>
              <div className="auth-brand-title">MedSync</div>
              <div className="auth-brand-tagline">Clinical & Appointment Care</div>
            </div>
          </div>

          <div className="auth-showcase-content">
            <h1 className="auth-main-headline">
              Next-Generation <br />
              <span className="highlight-blue">Healthcare</span> Management
            </h1>
            <p className="auth-sub-headline">
              Seamlessly connect patients with top medical specialists. Intelligent scheduling, real-time availability, and clinical workflows.
            </p>

            <div className="auth-feature-list">
              <div className="auth-feature-item">
                <div className="auth-feature-icon">
                  <CalendarIcon size={18} />
                </div>
                <div>
                  <div className="auth-feature-title">Conflict-Free Scheduling</div>
                  <div className="auth-feature-desc">Doctor scheduling & instant bookings</div>
                </div>
              </div>

              <div className="auth-feature-item">
                <div className="auth-feature-icon">
                  <ShieldIcon size={18} />
                </div>
                <div>
                  <div className="auth-feature-title">HIPAA-Aligned Security</div>
                  <div className="auth-feature-desc">Secure patient profiles & records</div>
                </div>
              </div>

              <div className="auth-feature-item">
                <div className="auth-feature-icon">
                  <ClockIcon size={18} />
                </div>
                <div>
                  <div className="auth-feature-title">Intelligent Workflows</div>
                  <div className="auth-feature-desc">Clinical workflows & provider controls</div>
                </div>
              </div>

              <div className="auth-feature-item">
                <div className="auth-feature-icon">
                  <CheckIcon size={18} />
                </div>
                <div>
                  <div className="auth-feature-title">Enterprise-Grade Security</div>
                  <div className="auth-feature-desc">Built with security & compliance at core</div>
                </div>
              </div>
            </div>
          </div>

          <div className="auth-left-footer">
            <span>© 2026 MedSync Systems. All rights reserved.</span>
          </div>
        </div>

        {/* Right Side Login Card (~48% width) */}
        <div className="auth-right-panel">
          <div className="auth-card">
            <div className="auth-card-top-icon">
              <StethoscopeIcon size={26} />
            </div>

            <h2 className="auth-card-title">Welcome Back</h2>
            <p className="auth-card-subtitle">
              Sign in to your MedSync account
            </p>

            {/* Success Banner */}
            {successMsg && (
              <div className="alert-banner alert-success">
                <CheckCircleIcon size={18} />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Error Banner */}
            {errorMsg && (
              <div className="alert-banner alert-error">
                <AlertCircleIcon size={18} />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              {/* Email Input */}
              <div className="form-group">
                <label className="form-label" htmlFor="email-input">
                  Email Address
                </label>
                <div className="input-wrapper">
                  <div className="input-icon">
                    <MailIcon size={19} />
                  </div>
                  <input
                    id="email-input"
                    type="email"
                    className="form-input"
                    placeholder="doctor@example.com or patient@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="form-group">
                <label className="form-label" htmlFor="password-input">
                  Password
                </label>
                <div className="input-wrapper">
                  <div className="input-icon">
                    <LockIcon size={19} />
                  </div>
                  <input
                    id="password-input"
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="input-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                  </button>
                </div>
              </div>

              {/* Remember Me & Forgot Password */}
              <div className="auth-options-row">
                <label className="auth-remember-label">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--blue-600)' }}
                  />
                  <span>Remember me</span>
                </label>

                <span
                  style={{ color: 'var(--text-muted)', fontSize: '0.86rem', cursor: 'pointer' }}
                  onClick={() => setErrorMsg('For password resets, please contact your clinic administrator or support.')}
                >
                  Forgot password?
                </span>
              </div>

              {/* Primary Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="btn-auth-primary"
              >
                {loading ? (
                  <>
                    <div className="spinner" style={{ width: '18px', height: '18px' }}></div>
                    <span>Signing in...</span>
                  </>
                ) : (
                  <span>Sign In</span>
                )}
              </button>

              {/* Card Footer Link */}
              <div className="auth-card-footer" style={{ marginTop: '1.75rem' }}>
                Don't have an account?{' '}
                <Link to="/register" className="auth-link">
                  Create an account
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Global Bottom Footer */}
      <footer className="auth-global-footer">
        <div>© 2026 MedSync Systems. All rights reserved.</div>

        <div className="auth-footer-links">
          <span>Need help? <a href="mailto:support@medsync.health" className="auth-link" style={{ fontWeight: 500 }}>Contact Support</a></span>
          <span>•</span>
          <span>For Providers: <Link to="/login" className="auth-link" style={{ fontWeight: 500 }}>Provider Login</Link></span>
        </div>

        <div className="auth-footer-badge">
          <ShieldIcon size={13} />
          <span>HIPAA • GDPR • SOC 2 Ready</span>
        </div>
      </footer>
    </div>
  );
};
