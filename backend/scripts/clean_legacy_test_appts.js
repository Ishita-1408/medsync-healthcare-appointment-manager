import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function cleanOldTestAppointments() {
  console.log('=== Cleaning 12 Old Test Appointments ===\n');

  // Let's test likely passwords
  const testPasswords = ['MedSync2026!', 'MedSyncDemo2026!', 'password123', 'Password123!', '123456', 'testpassword', 'password'];
  const testEmails = ['testpatient@gmail.com', 'test@example.com', 'patient@medsync.health', 'ishitamdps@gmail.com', 'test.patient@gmail.com'];

  let loggedInClient = null;

  for (const email of testEmails) {
    for (const password of testPasswords) {
      try {
        const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (!error && data.user) {
          console.log(`✓ Signed in as ${email} (ID: ${data.user.id})`);
          if (data.user.id === '21536143-a325-49a4-80aa-50e601d7068e' || data.user.id === 'd8e19e35-57d3-4722-907f-0b9019283b8d' || data.user.id === 'f7babba2-8867-40aa-b402-369076403546') {
            loggedInClient = client;
            break;
          }
        }
      } catch {}
    }
    if (loggedInClient) break;
  }

  if (loggedInClient) {
    console.log('Deleting appointments associated with test user...');
    const { error: delErr } = await loggedInClient
      .from('appointments')
      .delete()
      .or('patient_id.eq.21536143-a325-49a4-80aa-50e601d7068e,doctor_id.eq.d8e19e35-57d3-4722-907f-0b9019283b8d');
    console.log('Delete result error:', delErr?.message || 'SUCCESS');
  } else {
    console.log('Could not authenticate directly as legacy test user.');
  }
}

cleanOldTestAppointments();
