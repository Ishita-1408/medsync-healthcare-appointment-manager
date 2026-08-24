import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { config } from '../src/config/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey || config.supabase.anonKey
);

async function inspectShikhaPrem() {
  const doctorId = 'b34d1c09-9c6d-422f-b483-fe05c23cf580';
  const sarahId = '2e6250d2-5554-4787-aae0-560cffcad365';
  const patientId = '60bd8fd0-c1ac-434e-88ec-f2abd06544c7';

  console.log('--- DOCTOR SHIKHA PREM ---');
  const { data: d1 } = await supabase.from('doctor_profiles').select('*').eq('id', doctorId);
  console.log('doctor_profiles:', d1);

  const { data: p1 } = await supabase.from('profiles').select('*').eq('id', doctorId);
  console.log('profiles:', p1);

  console.log('\n--- DOCTOR SARAH CONNOR ---');
  const { data: d2 } = await supabase.from('doctor_profiles').select('*').eq('id', sarahId);
  console.log('doctor_profiles:', d2);

  const { data: p2 } = await supabase.from('profiles').select('*').eq('id', sarahId);
  console.log('profiles:', p2);

  console.log('\n--- PATIENT MIA GREENE ---');
  const { data: p3 } = await supabase.from('profiles').select('*').eq('id', patientId);
  console.log('profiles:', p3);
}

inspectShikhaPrem();
