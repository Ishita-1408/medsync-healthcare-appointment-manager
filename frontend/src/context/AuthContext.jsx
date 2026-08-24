import React, { createContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch role and details exclusively from public.profiles and related tables
  const fetchUserProfile = async (userId) => {
    if (!userId) return null;
    try {
      const { data: prof, error: profError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profError) {
        console.error('Error fetching profile from public.profiles:', profError.message);
        return null;
      }

      if (!prof) {
        console.warn('No profile found in public.profiles for user:', userId);
        return null;
      }

      let extraDetails = {};
      if (prof.role === 'DOCTOR') {
        const { data: docData } = await supabase
          .from('doctor_profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        extraDetails = { doctorProfile: docData };
      } else if (prof.role === 'PATIENT') {
        const { data: patData } = await supabase
          .from('patient_profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        extraDetails = { patientProfile: patData };
      }

      const fullProfile = { ...prof, ...extraDetails };
      setProfile(fullProfile);
      setRole(prof.role); // Role sourced strictly from public.profiles.role
      return fullProfile;
    } catch (err) {
      console.error('Unexpected error fetching user profile:', err);
      return null;
    }
  };

  useEffect(() => {
    let isMounted = true;

    // 1. Initial session check on mount
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          if (isMounted) setUser(session.user);
          await fetchUserProfile(session.user.id);
        }
      } catch (err) {
        console.error('Error initializing auth session:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initializeAuth();

    // 2. Real-time auth listener (listens to sign in, sign out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user);
        await fetchUserProfile(session.user.id);
      } else {
        setUser(null);
        setProfile(null);
        setRole(null);
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  // Login handler
  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      throw error;
    }

    if (data?.user) {
      setUser(data.user);
      const userProf = await fetchUserProfile(data.user.id);
      return { user: data.user, profile: userProf, role: userProf?.role };
    }

    return data;
  };

  // Public Registration handler (Strictly PATIENT or DOCTOR)
  const register = async (formData) => {
    const {
      email,
      password,
      firstName,
      lastName,
      phoneNumber,
      role: selectedRole,
      specialization,
      licenseNumber,
    } = formData;

    // Security check: Public registration is disallowed for ADMIN role
    if (selectedRole !== 'PATIENT' && selectedRole !== 'DOCTOR') {
      throw new Error('Registration is only permitted for Patient or Doctor roles.');
    }

    // 1. Sign up with Supabase Auth (Email Provider)
    // Metadata keys match the database trigger handle_new_user() precisely
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone_number: phoneNumber?.trim() || null,
          role: selectedRole,
          specialization: selectedRole === 'DOCTOR' ? (specialization?.trim() || 'General Medicine') : null,
          license_number: selectedRole === 'DOCTOR' ? licenseNumber?.trim() : null,
        },
      },
    });

    if (authError) {
      throw authError;
    }

    const newUser = authData?.user;
    if (!newUser) {
      throw new Error('User creation failed. Please check credentials and try again.');
    }

    // 2. Profile provisioning is handled securely by PostgreSQL trigger (SECURITY DEFINER)
    // If a session exists immediately (e.g. auto-confirm enabled in Supabase), load profile
    if (authData.session) {
      setUser(newUser);
      const createdProfile = await fetchUserProfile(newUser.id);
      return { user: newUser, profile: createdProfile, needsVerification: false };
    }

    // Email confirmation required
    return { user: newUser, profile: null, needsVerification: true };
  };

  // Logout handler
  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Error during signOut:', err);
    } finally {
      setUser(null);
      setProfile(null);
      setRole(null);
    }
  };

  const value = {
    user,
    profile,
    role, // Sourced strictly from public.profiles.role
    loading,
    login,
    register,
    logout,
    refreshProfile: () => (user ? fetchUserProfile(user.id) : Promise.resolve(null)),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export { AuthContext };
export { useAuth } from './useAuth';
