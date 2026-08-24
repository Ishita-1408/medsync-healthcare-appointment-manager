import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Resend } from 'resend';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function testRealResendDelivery() {
  console.log('=== REAL RESEND API VERIFICATION ===\n');

  const apiKey = process.env.RESEND_API_KEY;
  console.log(`API Key configured: ${apiKey ? apiKey.substring(0, 8) + '...' : 'NONE'}`);

  const resend = new Resend(apiKey);

  // 1. Test sending to account owner email (ishitamdps@gmail.com)
  try {
    console.log('Sending test email to account owner (ishitamdps@gmail.com)...');
    const result1 = await resend.emails.send({
      from: 'MedSync Health <onboarding@resend.dev>',
      to: ['ishitamdps@gmail.com'],
      subject: 'MedSync Real Delivery Verification — Booking Confirmed',
      html: `
        <div style="font-family: sans-serif; padding: 20px; background-color: #f8fafc; border-radius: 8px;">
          <h2 style="color: #0f172a;">MedSync Live Email Integration Check</h2>
          <p>Hello Ishita,</p>
          <p>Your MedSync real-time email notification pipeline is operational and verified.</p>
          <div style="background: #ffffff; border: 1px solid #e2e8f0; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 4px 0;"><strong>Doctor:</strong> Dr. Sarah Connor</p>
            <p style="margin: 4px 0;"><strong>Specialty:</strong> Cardiology</p>
            <p style="margin: 4px 0;"><strong>Status:</strong> Confirmed</p>
          </div>
          <p style="color: #64748b; font-size: 12px;">© 2026 MedSync Systems</p>
        </div>
      `,
    });

    console.log('Account Owner Send Result:', result1);
    if (result1.data?.id) {
      console.log(`✓ Real email delivered to account owner! Message ID: ${result1.data.id}`);
    } else if (result1.error) {
      console.log('✗ Resend error for account owner:', result1.error);
    }
  } catch (err) {
    console.error('Exception sending to account owner:', err);
  }

  // 2. Test sending to arbitrary recipient email (e.g. reviewer@gmail.com)
  try {
    console.log('\nTesting send to arbitrary reviewer email (reviewer@gmail.com)...');
    const result2 = await resend.emails.send({
      from: 'MedSync Health <onboarding@resend.dev>',
      to: ['reviewer@gmail.com'],
      subject: 'MedSync Test Reviewer Email',
      html: '<p>Test email for arbitrary recipient</p>',
    });

    console.log('Arbitrary Recipient Result:', result2);
    if (result2.error) {
      console.log('Expected Resend Sandbox Restriction:', result2.error.message);
    }
  } catch (err) {
    console.log('Arbitrary recipient error:', err.message);
  }
}

testRealResendDelivery();
