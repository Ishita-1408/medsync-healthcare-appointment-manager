import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { PatientDashboard } from './pages/PatientDashboard';
import { DoctorDashboard } from './pages/DoctorDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { ErrorBoundary } from './components/ErrorBoundary';

// Automatically routes authenticated users to their respective dashboard or unauthenticated to /login

function HomeRedirect() {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="page-loader-screen">
        <div className="spinner spinner-dark" style={{ width: '28px', height: '28px', borderWidth: '3px' }}></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (role === 'DOCTOR') return <Navigate to="/doctor" replace />;
  if (role === 'ADMIN') return <Navigate to="/admin" replace />;
  return <Navigate to="/patient" replace />;
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Protected Patient Portal */}
            <Route
              path="/patient"
              element={
                <ProtectedRoute allowedRoles={['PATIENT']}>
                  <PatientDashboard />
                </ProtectedRoute>
              }
            />

            {/* Protected Doctor Portal */}
            <Route
              path="/doctor"
              element={
                <ProtectedRoute allowedRoles={['DOCTOR']}>
                  <DoctorDashboard />
                </ProtectedRoute>
              }
            />

            {/* Protected Admin Console */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />

            {/* Catch-all fallback */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </ErrorBoundary>
      </AuthProvider>
    </Router>
  );

}

export default App;
