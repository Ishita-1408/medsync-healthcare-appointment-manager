import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const DEMO_PASSWORD = 'MedSyncDemo2026!';

async function seedDemoUsers() {
  console.log('\n=== CREATING OFFICIAL DEMO ACCOUNTS VIA SUPABASE AUTH ===\n');

  // 1. Patient: Jane Cooper
  console.log('Creating Patient: Jane Cooper (patient.demo@medsync.health)...');
  try {
    const { data: patAuth, error: patErr } = await supabase.auth.signUp({
      email: 'patient.demo@medsync.health',
      password: DEMO_PASSWORD,
      options: {
        data: {
          first_name: 'Jane',
          last_name: 'Cooper',
          phone_number: '+91 98765 43210',
          role: 'PATIENT',
        },
      },
    });

    if (patErr) {
      console.log('Patient signup notice:', patErr.message);
    } else {
      console.log('✓ Patient Jane Cooper signed up successfully (User ID:', patAuth?.user?.id, ')');
    }
  } catch (e) {
    console.error('Patient error:', e.message);
  }

  // 2. Doctor 1: Dr. Ananya Sharma (General Medicine)
  console.log('\nCreating Doctor: Dr. Ananya Sharma (dr.ananya@medsync.health)...');
  try {
    const { data: doc1Auth, error: doc1Err } = await supabase.auth.signUp({
      email: 'dr.ananya@medsync.health',
      password: DEMO_PASSWORD,
      options: {
        data: {
          first_name: 'Ananya',
          last_name: 'Sharma',
          phone_number: '+91 98111 22334',
          role: 'DOCTOR',
          specialization: 'General Medicine',
          license_number: 'MED-849204',
        },
      },
    });

    if (doc1Err) {
      console.log('Dr. Ananya signup notice:', doc1Err.message);
    } else {
      console.log('✓ Dr. Ananya Sharma signed up successfully (User ID:', doc1Auth?.user?.id, ')');
    }
  } catch (e) {
    console.error('Doctor 1 error:', e.message);
  }

  // 3. Doctor 2: Dr. Rahul Mehta (Cardiology)
  console.log('\nCreating Doctor: Dr. Rahul Mehta (dr.rahul@medsync.health)...');
  try {
    const { data: doc2Auth, error: doc2Err } = await supabase.auth.signUp({
      email: 'dr.rahul@medsync.health',
      password: DEMO_PASSWORD,
      options: {
        data: {
          first_name: 'Rahul',
          last_name: 'Mehta',
          phone_number: '+91 98222 33445',
          role: 'DOCTOR',
          specialization: 'Cardiology',
          license_number: 'MED-910482',
        },
      },
    });

    if (doc2Err) {
      console.log('Dr. Rahul signup notice:', doc2Err.message);
    } else {
      console.log('✓ Dr. Rahul Mehta signed up successfully (User ID:', doc2Auth?.user?.id, ')');
    }
  } catch (e) {
    console.error('Doctor 2 error:', e.message);
  }

  // Check created profiles in public.profiles
  const { data: allProfiles, error: profErr } = await supabase.from('profiles').select('*');
  console.log('\nCurrent Profiles in Database:', allProfiles);
}

seedDemoUsers();
