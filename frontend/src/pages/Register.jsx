import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  StethoscopeIcon,
  UserIcon,
  MailIcon,
  LockIcon,
  PhoneIcon,
  BadgeCheckIcon,
  EyeIcon,
  EyeOffIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  ShieldIcon,
  CalendarIcon,
  ClockIcon,
  CheckIcon,
} from '../components/Icons';

export const Register = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  // Form State
  const [role, setRole] = useState('PATIENT'); // 'PATIENT' | 'DOCTOR'
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Doctor-Specific Fields
  const [specialization, setSpecialization] = useState('General Medicine');
  const [licenseNumber, setLicenseNumber] = useState('');

  // Status & Feedback State
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successInfo, setSuccessInfo] = useState(null);

  const medicalSpecialties = [
    'General Medicine',
    'Cardiology',
    'Dermatology',
    'Pediatrics',
    'Orthopedics',
    'Neurology',
    'Psychiatry',
    'Gynecology & Obstetrics',
    'Ophthalmology',
    'ENT (Otolaryngology)',
    'Endocrinology',
    'Oncology',
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessInfo(null);

    // Validation
    if (!firstName.trim() || !lastName.trim()) {
      setErrorMsg('Please enter your full first and last name.');
      return;
    }

    if (!email.trim()) {
      setErrorMsg('Please provide a valid email address.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please re-enter your password.');
      return;
    }

    if (role === 'DOCTOR') {
      if (!specialization.trim()) {
        setErrorMsg('Please select or specify your medical specialization.');
        return;
      }
      if (!licenseNumber.trim()) {
        setErrorMsg('Please provide your official Medical License Number.');
        return;
      }
    }

    setLoading(true);

    try {
      const result = await register({
        role,
        firstName,
        lastName,
        email,
        phoneNumber,
        password,
        specialization,
        licenseNumber,
      });

      if (result.needsVerification) {
        setSuccessInfo({
          title: 'Account Created Successfully!',
          description: `A verification email has been dispatched to ${email}. Please check your inbox and verify your email to activate your account.`,
        });
      } else {
        // Auto-logged in
        if (role === 'DOCTOR') {
          navigate('/doctor', { replace: true });
        } else {
          navigate('/patient', { replace: true });
        }
      }
    } catch (err) {
      console.error('Registration error:', err);
      if (err.message && err.message.includes('User already registered')) {
        setErrorMsg('An account with this email already exists. Please sign in instead.');
      } else {
        setErrorMsg(err.message || 'Registration failed. Please try again.');
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
              Join the Future of <br />
              <span className="highlight-blue">Connected Healthcare</span>
            </h1>
            <p className="auth-sub-headline">
              Whether you are a patient seeking top-tier clinical care or a medical specialist managing your practice, MedSync provides the tools for seamless medical coordination.
            </p>

            <div className="auth-feature-list">
              <div className="auth-feature-item">
                <div className="auth-feature-icon">
                  <CalendarIcon size={18} />
                </div>
                <div>
                  <div className="auth-feature-title">Direct Specialist Booking</div>
                  <div className="auth-feature-desc">Direct booking with licensed specialists</div>
                </div>
              </div>

              <div className="auth-feature-item">
                <div className="auth-feature-icon">
                  <ClockIcon size={18} />
                </div>
                <div>
                  <div className="auth-feature-title">Schedule Management</div>
                  <div className="auth-feature-desc">Automated working hours & leave controls</div>
                </div>
              </div>

              <div className="auth-feature-item">
                <div className="auth-feature-icon">
                  <ShieldIcon size={18} />
                </div>
                <div>
                  <div className="auth-feature-title">Health Profile Protection</div>
                  <div className="auth-feature-desc">Safe and confidential health records</div>
                </div>
              </div>

              <div className="auth-feature-item">
                <div className="auth-feature-icon">
                  <CheckIcon size={18} />
                </div>
                <div>
                  <div className="auth-feature-title">Protected Health Security</div>
                  <div className="auth-feature-desc">Built with security & compliance at core</div>
                </div>
              </div>
            </div>
          </div>

          <div className="auth-left-footer">
            <span>© 2026 MedSync Systems. All rights reserved.</span>
          </div>
        </div>

        {/* Right Side Registration Card (~48% width) */}
        <div className="auth-right-panel">
          <div className="auth-card" style={{ maxWidth: '520px' }}>
            <div className="auth-card-top-icon">
              <StethoscopeIcon size={26} />
            </div>

            <h2 className="auth-card-title">Create Account</h2>
            <p className="auth-card-subtitle">
              Create your MedSync account to get started
            </p>

            {/* Role Selection Tabs */}
            <div className="role-tabs">
              <button
                type="button"
                className={`role-tab ${role === 'PATIENT' ? 'active patient' : ''}`}
                onClick={() => setRole('PATIENT')}
              >
                <UserIcon size={18} />
                <span>Patient Account</span>
              </button>
              <button
                type="button"
                className={`role-tab ${role === 'DOCTOR' ? 'active doctor' : ''}`}
                onClick={() => setRole('DOCTOR')}
              >
                <StethoscopeIcon size={18} />
                <span>Doctor / Specialist</span>
              </button>
            </div>

            {/* Success Screen after email signup */}
            {successInfo ? (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <div
                  style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    background: 'var(--success-bg)',
                    color: 'var(--success-text)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 1.25rem',
                  }}
                >
                  <CheckCircleIcon size={32} />
                </div>
                <h3 style={{ fontSize: '1.35rem', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
                  {successInfo.title}
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '1.75rem' }}>
                  {successInfo.description}
                </p>
                <Link to="/login" className="btn-auth-primary" style={{ textDecoration: 'none' }}>
                  Go to Login
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate>
                {/* Error Banner */}
                {errorMsg && (
                  <div className="alert-banner alert-error">
                    <AlertCircleIcon size={18} />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* Name Grid */}
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label" htmlFor="reg-first-name">
                      First Name *
                    </label>
                    <div className="input-wrapper">
                      <div className="input-icon">
                        <UserIcon size={18} />
                      </div>
                      <input
                        id="reg-first-name"
                        type="text"
                        className="form-input"
                        placeholder="John"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        required
                        autoComplete="given-name"
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="reg-last-name">
                      Last Name *
                    </label>
                    <div className="input-wrapper">
                      <div className="input-icon">
                        <UserIcon size={18} />
                      </div>
                      <input
                        id="reg-last-name"
                        type="text"
                        className="form-input"
                        placeholder="Doe"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        required
                        autoComplete="family-name"
                      />
                    </div>
                  </div>
                </div>

                {/* Email Address */}
                <div className="form-group">
                  <label className="form-label" htmlFor="reg-email">
                    Email Address *
                  </label>
                  <div className="input-wrapper">
                    <div className="input-icon">
                      <MailIcon size={18} />
                    </div>
                    <input
                      id="reg-email"
                      type="email"
                      className="form-input"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </div>
                </div>

                {/* Phone Number */}
                <div className="form-group">
                  <label className="form-label" htmlFor="reg-phone">
                    Phone Number
                  </label>
                  <div className="input-wrapper">
                    <div className="input-icon">
                      <PhoneIcon size={18} />
                    </div>
                    <input
                      id="reg-phone"
                      type="tel"
                      className="form-input"
                      placeholder="+1 (555) 000-0000"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      autoComplete="tel"
                    />
                  </div>
                </div>

                {/* Doctor-Specific Fields */}
                {role === 'DOCTOR' && (
                  <div
                    style={{
                      background: 'var(--blue-50)',
                      padding: '1.15rem 1.25rem',
                      borderRadius: 'var(--radius-md)',
                      marginBottom: '1.25rem',
                      border: '1.5px solid var(--blue-100)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.85rem' }}>
                      <BadgeCheckIcon size={18} style={{ color: 'var(--blue-700)' }} />
                      <strong style={{ fontSize: '0.88rem', color: 'var(--blue-900)' }}>
                        Doctor Verification Details
                      </strong>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="reg-specialization">
                        Medical Specialization *
                      </label>
                      <div className="input-wrapper">
                        <div className="input-icon">
                          <StethoscopeIcon size={18} />
                        </div>
                        <select
                          id="reg-specialization"
                          className="form-select"
                          value={specialization}
                          onChange={(e) => setSpecialization(e.target.value)}
                          required
                          style={{ cursor: 'pointer' }}
                        >
                          {medicalSpecialties.map((spec) => (
                            <option key={spec} value={spec}>
                              {spec}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" htmlFor="reg-license">
                        Medical License Number *
                      </label>
                      <div className="input-wrapper">
                        <div className="input-icon">
                          <ShieldIcon size={18} />
                        </div>
                        <input
                          id="reg-license"
                          type="text"
                          className="form-input"
                          placeholder="e.g. MD-849204"
                          value={licenseNumber}
                          onChange={(e) => setLicenseNumber(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Password Grid */}
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label" htmlFor="reg-password">
                      Password *
                    </label>
                    <div className="input-wrapper">
                      <div className="input-icon">
                        <LockIcon size={18} />
                      </div>
                      <input
                        id="reg-password"
                        type={showPassword ? 'text' : 'password'}
                        className="form-input"
                        placeholder="Min. 6 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="reg-confirm-password">
                      Confirm Password *
                    </label>
                    <div className="input-wrapper">
                      <div className="input-icon">
                        <LockIcon size={18} />
                      </div>
                      <input
                        id="reg-confirm-password"
                        type={showPassword ? 'text' : 'password'}
                        className="form-input"
                        placeholder="Repeat password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        autoComplete="new-password"
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
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  className="btn-auth-primary"
                  style={{ marginTop: '0.75rem' }}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <div className="spinner" style={{ width: '18px', height: '18px' }}></div>
                      <span>Creating {role === 'DOCTOR' ? 'Doctor' : 'Patient'} Account...</span>
                    </>
                  ) : (
                    <span>Register as {role === 'DOCTOR' ? 'Doctor' : 'Patient'}</span>
                  )}
                </button>
              </form>
            )}

            {/* Card Footer Link */}
            <div className="auth-card-footer" style={{ marginTop: '1.5rem' }}>
              Already have an account?{' '}
              <Link to="/login" className="auth-link">
                Sign in here
              </Link>
            </div>
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

