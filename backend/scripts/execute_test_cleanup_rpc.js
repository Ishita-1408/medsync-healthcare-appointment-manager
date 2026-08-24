import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function runCleanup() {
  console.log('Executing delete_test_patient_records RPC for test patient 21536143-a325-49a4-80aa-50e601d7068e...');
  const { data, error } = await supabase.rpc('delete_test_patient_records', {
    p_test_patient_id: '21536143-a325-49a4-80aa-50e601d7068e',
  });

  if (error) {
    console.log('RPC execution note:', error.message);
  } else {
    console.log('RPC result:', JSON.stringify(data, null, 2));
  }
}

runCleanup();
