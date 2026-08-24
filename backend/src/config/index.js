import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();


export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  ai: {
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
  },
  email: {
    provider: (process.env.EMAIL_PROVIDER || 'resend').toLowerCase(),
    resendApiKey: process.env.RESEND_API_KEY || '',
    from: process.env.EMAIL_FROM || 'MedSync Health <onboarding@resend.dev>',
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/calendar/auth/callback',
  },
};

// Validate critical configuration
export function validateConfig() {
  const warnings = [];
  if (!config.supabase.url) warnings.push('SUPABASE_URL is not defined.');
  if (!config.supabase.anonKey) warnings.push('SUPABASE_ANON_KEY is not defined.');

  if (warnings.length > 0) {
    console.warn('\x1b[33m%s\x1b[0m', '⚠️  [Config Warning]: ' + warnings.join(' '));
  } else {
    console.log('\x1b[32m%s\x1b[0m', '✓ Configuration validated successfully.');
  }


  // Safe Google OAuth Status Logging (Never logging secrets)
  console.log('\x1b[34m%s\x1b[0m', '--- Google OAuth 2.0 Integration Status ---');
  console.log(`GOOGLE_CLIENT_ID configured: ${Boolean(config.google.clientId)}`);
  console.log(`GOOGLE_CLIENT_SECRET configured: ${Boolean(config.google.clientSecret)}`);
  console.log(`GOOGLE_REDIRECT_URI configured: ${Boolean(config.google.redirectUri)} -> ${config.google.redirectUri}`);
  console.log(`GOOGLE_CALENDAR_SCOPES configured: ${Boolean(process.env.GOOGLE_CALENDAR_SCOPES || true)}`);
}

