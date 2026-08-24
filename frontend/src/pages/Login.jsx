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

              {/* Social Login Divider */}
              <div className="auth-divider">
                <span>or continue with</span>
              </div>

              {/* Secondary OAuth Buttons */}
              <div className="auth-social-grid">
                <button
                  type="button"
                  className="btn-social"
                  title="Direct password sign-in is active for your clinic account"
                  onClick={() => setErrorMsg('OAuth single-sign-on is managed via institutional SSO. Please use your clinic email and password.')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#EA4335" d="M12 5c1.54 0 2.94.55 4.04 1.45l3.03-3.03C17.21 1.7 14.77 1 12 1 7.42 1 3.56 3.63 1.73 7.44l3.66 2.84C6.27 7.21 8.87 5 12 5z"/>
                    <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58l3.71 2.88c2.16-2 3.71-4.94 3.71-8.7z"/>
                    <path fill="#FBBC05" d="M5.39 14.72c-.24-.71-.39-1.47-.39-2.27s.15-1.56.39-2.27L1.73 7.34C.63 9.53 0 11.98 0 14.55s.63 5.02 1.73 7.21l3.66-2.84z"/>
                    <path fill="#34A853" d="M12 23.55c3.24 0 5.95-1.08 7.93-2.91l-3.71-2.88c-1.08.73-2.47 1.18-4.22 1.18-3.13 0-5.73-2.21-6.61-5.28L1.73 16.5C3.56 20.37 7.42 23.55 12 23.55z"/>
                  </svg>
                  <span>Google</span>
                </button>

                <button
                  type="button"
                  className="btn-social"
                  title="Direct password sign-in is active for your clinic account"
                  onClick={() => setErrorMsg('Microsoft Azure AD is configured for hospital enterprise networks. Please use your clinic credentials.')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#F25022" d="M1 1h10v10H1z"/>
                    <path fill="#00A4EF" d="M1 13h10v10H1z"/>
                    <path fill="#7FBA00" d="M13 1h10v10H13z"/>
                    <path fill="#FFB900" d="M13 13h10v10H13z"/>
                  </svg>
                  <span>Microsoft</span>
                </button>
              </div>

              {/* Card Footer Link */}
              <div className="auth-card-footer">
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
