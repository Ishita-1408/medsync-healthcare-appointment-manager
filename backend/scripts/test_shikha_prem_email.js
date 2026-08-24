import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendEmail, getBookingConfirmationTemplate, formatDoctorName } from '../src/services/emailService.js';
import { config } from '../src/config/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function testShikhaPremBookingEmail() {
  console.log('\n================================================================');
  console.log('  Testing Controlled Appointment Email: Shikha Prem');
  console.log('================================================================\n');

  const doctorName = 'Dr. Shikha Prem';
  const doctorSpecialty = 'Pediatrics';
  const patientName = 'Mia Greene';
  const patientEmail = 'ishitamdps@gmail.com';
  const apptDateStr = 'August 26, 2026';
  const apptTimeStr = '11:00 AM UTC';

  console.log('1. GENERATING BOOKING CONFIRMATION TEMPLATE:');
  const template = getBookingConfirmationTemplate({
    patientName,
    doctorName,
    doctorSpecialty,
    dateStr: apptDateStr,
    timeStr: apptTimeStr,
    role: 'PATIENT',
  });

  console.log(`- Subject: "${template.subject}"`);
  console.log(`- Recipient: ${patientEmail}`);
  console.log(`- Doctor Formatted: ${formatDoctorName(doctorName)}`);

  console.log('\n2. DISPATCHING TO REAL RESEND PROVIDER:');
  try {
    const result = await sendEmail({
      to: patientEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    console.log('\x1b[32m%s\x1b[0m', `✓ [Resend Success] Email delivered! Provider Message ID: ${result.messageId}`);
    console.log('\n================================================================');
    console.log('  Shikha Prem Appointment Email Test: PASSED');
    console.log('================================================================\n');
  } catch (err) {
    console.log('\x1b[31m%s\x1b[0m', `✗ [Resend Error]: ${err.message}`);
  }
}

testShikhaPremBookingEmail();
