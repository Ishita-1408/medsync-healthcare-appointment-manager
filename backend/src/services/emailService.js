import { Resend } from 'resend';
import { config } from '../config/index.js';

let resendClient = null;
if (config.email.resendApiKey) {
  resendClient = new Resend(config.email.resendApiKey);
}

/**
 * Escapes HTML characters to prevent XSS / HTML injection in dynamic templates
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Normalizes doctor names to prevent duplicate 'Dr. Dr.' titles
 * Examples:
 *  'Dr. Angel Priya' -> 'Dr. Angel Priya'
 *  'Dr Angel Priya'  -> 'Dr. Angel Priya'
 *  'Angel Priya'     -> 'Dr. Angel Priya'
 *  'DR. Angel Priya' -> 'Dr. Angel Priya'
 */
export function formatDoctorName(name) {
  if (!name) return 'Dr. Physician';
  let cleaned = String(name).trim();
  cleaned = cleaned.replace(/^(dr\.?\s*)+/i, '').trim();
  return `Dr. ${cleaned}`;
}

/**
 * Common HTML Email Layout Wrapper
 */
function wrapEmailHtml({ title, preheader, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #1e293b; }
    .container { max-width: 580px; margin: 24px auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #0f172a 0%, #134e4a 60%, #0d9488 100%); padding: 24px 32px; color: #ffffff; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 800; }
    .header p { margin: 4px 0 0; font-size: 13px; opacity: 0.85; }
    .content { padding: 32px; font-size: 15px; line-height: 1.6; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin: 20px 0; }
    .card-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
    .card-row:last-child { margin-bottom: 0; }
    .label { color: #64748b; font-weight: 600; }
    .val { color: #0f172a; font-weight: 700; }
    .footer { background: #f8fafc; padding: 20px 32px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
    .button { display: inline-block; background: #0d9488; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 700; font-size: 14px; margin-top: 16px; }
  </style>
</head>
<body>
  <div style="display:none;font-size:1px;color:#333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${escapeHtml(preheader || title)}
  </div>
  <div class="container">
    <div class="header">
      <h1>MedSync Healthcare</h1>
      <p>Appointment & Follow-up Care</p>
    </div>
    <div class="content">
      ${bodyHtml}
    </div>
    <div class="footer">
      <p style="margin: 0;">This is an automated notification from MedSync. Please do not reply directly to this email.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generate Template for Booking Confirmation (Patient or Doctor)
 */
export function getBookingConfirmationTemplate({ patientName, doctorName, doctorSpecialty, dateStr, timeStr, role = 'PATIENT' }) {
  const safePatient = escapeHtml(patientName || 'Patient');
  const safeDoctor = escapeHtml(formatDoctorName(doctorName));
  const safeSpecialty = escapeHtml(doctorSpecialty || 'General Practice');
  const safeDate = escapeHtml(dateStr);
  const safeTime = escapeHtml(timeStr);
  const isDoctor = String(role).toUpperCase() === 'DOCTOR';

  const subject = isDoctor
    ? `New Consultation Booked: ${safePatient} — MedSync`
    : `Your MedSync Appointment is Confirmed — ${safeDoctor}`;

  const preheader = isDoctor
    ? `New appointment scheduled with ${safePatient} on ${safeDate} at ${safeTime}.`
    : `Your consultation with ${safeDoctor} on ${safeDate} at ${safeTime} is confirmed.`;

  const bodyHtml = isDoctor
    ? `
      <p>Hello <strong>${safeDoctor}</strong>,</p>
      <p>A new consultation has been booked with you in the MedSync practice portal.</p>
      
      <div class="card">
        <div class="card-row"><span class="label">Patient Name:</span><span class="val"><strong>${safePatient}</strong></span></div>
        <div class="card-row"><span class="label">Consultation Date:</span><span class="val">${safeDate}</span></div>
        <div class="card-row"><span class="label">Time Slot:</span><span class="val">${safeTime}</span></div>
        <div class="card-row"><span class="label">Specialty / Type:</span><span class="val">${safeSpecialty}</span></div>
      </div>

      <p>Please review any incoming pre-visit intake information on your Doctor Dashboard before the consultation.</p>
      <p style="margin-top: 24px;">Warm regards,<br><strong>MedSync Practice Team</strong></p>
    `
    : `
      <p>Hello <strong>${safePatient}</strong>,</p>
      <p>Your healthcare appointment has been successfully booked and confirmed in the MedSync system.</p>
      
      <div class="card">
        <div class="card-row"><span class="label">Physician:</span><span class="val">${safeDoctor}</span></div>
        <div class="card-row"><span class="label">Specialty:</span><span class="val">${safeSpecialty}</span></div>
        <div class="card-row"><span class="label">Consultation Date:</span><span class="val">${safeDate}</span></div>
        <div class="card-row"><span class="label">Time:</span><span class="val">${safeTime}</span></div>
      </div>

      <p><strong>Next Steps:</strong> Please log in to your patient portal before your visit to complete your pre-visit symptom intake to help your doctor prepare.</p>
      <p style="margin-top: 24px;">Warm regards,<br><strong>MedSync Health Team</strong></p>
    `;

  const html = wrapEmailHtml({ title: subject, preheader, bodyHtml });
  const text = isDoctor
    ? `Hello ${safeDoctor},\n\nA new consultation has been booked with ${safePatient} for ${safeDate} at ${safeTime}.\n\nMedSync Practice Team`
    : `Hello ${safePatient},\n\nYour appointment with ${safeDoctor} (${safeSpecialty}) is confirmed for ${safeDate} at ${safeTime}.\n\nPlease complete your pre-visit symptom intake in the MedSync portal.\n\nMedSync Health Team`;

  return { subject, html, text };
}

/**
 * Generate Template for 24-Hour Reminder (Patient or Doctor)
 */
export function getReminder24hTemplate({ patientName, doctorName, doctorSpecialty, dateStr, timeStr, role = 'PATIENT' }) {
  const safePatient = escapeHtml(patientName || 'Patient');
  const safeDoctor = escapeHtml(formatDoctorName(doctorName));
  const safeSpecialty = escapeHtml(doctorSpecialty || 'General Practice');
  const safeDate = escapeHtml(dateStr);
  const safeTime = escapeHtml(timeStr);
  const isDoctor = String(role).toUpperCase() === 'DOCTOR';

  const subject = isDoctor
    ? `Practice Reminder: Consultation Tomorrow with ${safePatient}`
    : `Reminder: Your MedSync Appointment is Tomorrow — ${safeDoctor}`;

  const preheader = isDoctor
    ? `Practice reminder: Consultation with ${safePatient} scheduled for tomorrow, ${safeDate} at ${safeTime}.`
    : `Reminder: Your consultation with ${safeDoctor} is scheduled for tomorrow, ${safeDate} at ${safeTime}.`;

  const bodyHtml = isDoctor
    ? `
      <p>Hello <strong>${safeDoctor}</strong>,</p>
      <p>This is a practice reminder that you have a scheduled appointment <strong>tomorrow</strong>.</p>
      
      <div class="card">
        <div class="card-row"><span class="label">Patient Name:</span><span class="val"><strong>${safePatient}</strong></span></div>
        <div class="card-row"><span class="label">Date:</span><span class="val">${safeDate}</span></div>
        <div class="card-row"><span class="label">Time:</span><span class="val">${safeTime}</span></div>
      </div>

      <p>Please check your schedule and clinical notes on the MedSync Doctor Portal.</p>
      <p style="margin-top: 24px;">Warm regards,<br><strong>MedSync Practice Team</strong></p>
    `
    : `
      <p>Hello <strong>${safePatient}</strong>,</p>
      <p>This is a friendly reminder that your upcoming medical appointment is scheduled for <strong>tomorrow</strong>.</p>
      
      <div class="card">
        <div class="card-row"><span class="label">Physician:</span><span class="val">${safeDoctor} (${safeSpecialty})</span></div>
        <div class="card-row"><span class="label">Date:</span><span class="val">${safeDate}</span></div>
        <div class="card-row"><span class="label">Time:</span><span class="val">${safeTime}</span></div>
      </div>

      <p>If you haven't completed your pre-visit symptom intake yet, please do so prior to your consultation.</p>
      <p style="margin-top: 24px;">Warm regards,<br><strong>MedSync Health Team</strong></p>
    `;

  const html = wrapEmailHtml({ title: subject, preheader, bodyHtml });
  const text = isDoctor
    ? `Hello ${safeDoctor},\n\nPractice Reminder: Consultation tomorrow with ${safePatient} (${safeDate} at ${safeTime}).\n\nMedSync Practice Team`
    : `Hello ${safePatient},\n\nReminder: Your appointment with ${safeDoctor} is tomorrow (${safeDate} at ${safeTime}).\n\nMedSync Health Team`;

  return { subject, html, text };
}

/**
 * Generate Template for 2-Hour Reminder (Patient or Doctor)
 */
export function getReminder2hTemplate({ patientName, doctorName, doctorSpecialty, dateStr, timeStr, role = 'PATIENT' }) {
  const safePatient = escapeHtml(patientName || 'Patient');
  const safeDoctor = escapeHtml(formatDoctorName(doctorName));
  const safeSpecialty = escapeHtml(doctorSpecialty || 'General Practice');
  const safeDate = escapeHtml(dateStr);
  const safeTime = escapeHtml(timeStr);
  const isDoctor = String(role).toUpperCase() === 'DOCTOR';

  const subject = isDoctor
    ? `Practice Reminder: Consultation in 2 Hours with ${safePatient}`
    : `Reminder: Your MedSync Appointment is in 2 Hours — ${safeDoctor}`;

  const preheader = isDoctor
    ? `Consultation with ${safePatient} starts in 2 hours (${safeTime}).`
    : `Your consultation with ${safeDoctor} begins in 2 hours (${safeTime}).`;

  const bodyHtml = isDoctor
    ? `
      <p>Hello <strong>${safeDoctor}</strong>,</p>
      <p>Your consultation with patient <strong>${safePatient}</strong> begins in <strong>2 hours</strong>.</p>
      
      <div class="card">
        <div class="card-row"><span class="label">Patient:</span><span class="val"><strong>${safePatient}</strong></span></div>
        <div class="card-row"><span class="label">Time:</span><span class="val">${safeTime} (Today, ${safeDate})</span></div>
      </div>

      <p>Please have the patient intake and medical history ready.</p>
      <p style="margin-top: 24px;">Warm regards,<br><strong>MedSync Practice Team</strong></p>
    `
    : `
      <p>Hello <strong>${safePatient}</strong>,</p>
      <p>Your appointment with <strong>${safeDoctor}</strong> begins in <strong>2 hours</strong>.</p>
      
      <div class="card">
        <div class="card-row"><span class="label">Physician:</span><span class="val">${safeDoctor}</span></div>
        <div class="card-row"><span class="label">Time:</span><span class="val">${safeTime} (Today, ${safeDate})</span></div>
      </div>

      <p>Please be ready a few minutes ahead of time.</p>
      <p style="margin-top: 24px;">Warm regards,<br><strong>MedSync Health Team</strong></p>
    `;

  const html = wrapEmailHtml({ title: subject, preheader, bodyHtml });
  const text = isDoctor
    ? `Hello ${safeDoctor},\n\nPractice Reminder: Your appointment with ${safePatient} is in 2 hours (${safeTime}).\n\nMedSync Practice Team`
    : `Hello ${safePatient},\n\nYour appointment with ${safeDoctor} is in 2 hours (${safeTime}).\n\nMedSync Health Team`;

  return { subject, html, text };
}

/**
 * Generate Template for Cancellation (Patient or Doctor)
 */
export function getCancellationTemplate({ patientName, doctorName, doctorSpecialty, dateStr, timeStr, role = 'PATIENT' }) {
  const safePatient = escapeHtml(patientName || 'Patient');
  const safeDoctor = escapeHtml(formatDoctorName(doctorName));
  const safeSpecialty = escapeHtml(doctorSpecialty || 'General Practice');
  const safeDate = escapeHtml(dateStr);
  const safeTime = escapeHtml(timeStr);
  const isDoctor = String(role).toUpperCase() === 'DOCTOR';

  const subject = isDoctor
    ? `Consultation Cancelled: ${safePatient} — MedSync`
    : `Your MedSync Appointment Has Been Cancelled — ${safeDoctor}`;

  const preheader = isDoctor
    ? `Consultation with ${safePatient} on ${safeDate} has been cancelled.`
    : `Your appointment with ${safeDoctor} on ${safeDate} has been cancelled.`;

  const bodyHtml = isDoctor
    ? `
      <p>Hello <strong>${safeDoctor}</strong>,</p>
      <p>The upcoming consultation with patient <strong>${safePatient}</strong> has been cancelled.</p>
      
      <div class="card" style="background: #fef2f2; border-color: #fecaca;">
        <div class="card-row"><span class="label">Patient:</span><span class="val"><strong>${safePatient}</strong></span></div>
        <div class="card-row"><span class="label">Original Date & Time:</span><span class="val">${safeDate} at ${safeTime}</span></div>
        <div class="card-row"><span class="label">Status:</span><span class="val" style="color: #b91c1c;">CANCELLED</span></div>
      </div>

      <p>This slot is now released and available for other appointments.</p>
      <p style="margin-top: 24px;">Warm regards,<br><strong>MedSync Practice Team</strong></p>
    `
    : `
      <p>Hello <strong>${safePatient}</strong>,</p>
      <p>Your appointment with <strong>${safeDoctor}</strong> has been cancelled.</p>
      
      <div class="card" style="background: #fef2f2; border-color: #fecaca;">
        <div class="card-row"><span class="label">Physician:</span><span class="val">${safeDoctor}</span></div>
        <div class="card-row"><span class="label">Original Date & Time:</span><span class="val">${safeDate} at ${safeTime}</span></div>
        <div class="card-row"><span class="label">Status:</span><span class="val" style="color: #b91c1c;">CANCELLED</span></div>
      </div>

      <p>If you wish to reschedule, you may book a new slot anytime through your patient portal.</p>
      <p style="margin-top: 24px;">Warm regards,<br><strong>MedSync Health Team</strong></p>
    `;

  const html = wrapEmailHtml({ title: subject, preheader, bodyHtml });
  const text = isDoctor
    ? `Hello ${safeDoctor},\n\nThe consultation with ${safePatient} on ${safeDate} at ${safeTime} has been cancelled.\n\nMedSync Practice Team`
    : `Hello ${safePatient},\n\nYour appointment with ${safeDoctor} on ${safeDate} at ${safeTime} has been cancelled. You can book a new slot on the MedSync portal.\n\nMedSync Health Team`;

  return { subject, html, text };
}

/**
 * Generate Template for Medication Reminder
 */
export function getMedicationReminderTemplate({ patientName, medicationName, dosage, frequency, instructions }) {
  const safePatient = escapeHtml(patientName);
  const safeMed = escapeHtml(medicationName);
  const safeDosage = escapeHtml(dosage || 'As prescribed');
  const safeFreq = escapeHtml(frequency || 'Daily');
  const safeInst = escapeHtml(instructions || 'Take as instructed by your doctor');

  const subject = `Medication Reminder: Time to take ${safeMed} — MedSync`;
  const html = wrapEmailHtml({
    title: subject,
    preheader: `Time to take your medication: ${safeMed} (${safeDosage}).`,
    bodyHtml: `
      <p>Hello <strong>${safePatient}</strong>,</p>
      <p>This is a scheduled reminder from your care team to take your prescribed medication.</p>
      
      <div class="card">
        <div class="card-row"><span class="label">Medication:</span><span class="val"><strong>${safeMed}</strong></span></div>
        <div class="card-row"><span class="label">Dosage:</span><span class="val">${safeDosage}</span></div>
        <div class="card-row"><span class="label">Frequency:</span><span class="val">${safeFreq}</span></div>
        <div class="card-row"><span class="label">Instructions:</span><span class="val">${safeInst}</span></div>
      </div>

      <p>Consistent adherence to your medication schedule is critical for your recovery and well-being.</p>
      <p style="margin-top: 24px;">Warm regards,<br><strong>MedSync Care Team</strong></p>
    `,
  });

  const text = `Hello ${safePatient},\n\nMedication Reminder: Time to take ${safeMed} (${safeDosage}).\nInstructions: ${safeInst}\n\nMedSync Care Team`;

  return { subject, html, text };
}

/**
 * Generate Template for Finalized Prescription / Care Summary Notification
 */
export function getPrescriptionReadyTemplate({ patientName, doctorName, dateStr, medications = [], notes = '' }) {
  const safePatient = escapeHtml(patientName);
  const safeDoctor = escapeHtml(formatDoctorName(doctorName));
  const safeDate = escapeHtml(dateStr);
  const safeNotes = escapeHtml(notes);

  const medListHtml = medications.length > 0
    ? `<ul style="margin: 8px 0; padding-left: 20px;">
        ${medications.map((m) => `<li><strong>${escapeHtml(m.name || m.medication_name)}</strong> ${m.strength ? `(${escapeHtml(m.strength)})` : ''}: ${escapeHtml(m.dosage || '1 dose')}, ${escapeHtml(m.frequency || 'Daily')}</li>`).join('')}
       </ul>`
    : '<p style="margin: 0; font-style: italic; color: #64748b;">Review care plan instructions in your portal.</p>';

  const subject = `Your Prescription & Post-Visit Summary is Ready — ${safeDoctor}`;
  const html = wrapEmailHtml({
    title: subject,
    preheader: `Dr. ${safeDoctor} has finalized your medical consultation notes and digital prescription.`,
    bodyHtml: `
      <p>Hello <strong>${safePatient}</strong>,</p>
      <p>Your healthcare provider, <strong>${safeDoctor}</strong>, has finalized your medical consultation notes and digital prescription from your visit on ${safeDate}.</p>
      
      <div class="card">
        <div class="card-row"><span class="label">Physician:</span><span class="val">${safeDoctor}</span></div>
        <div class="card-row"><span class="label">Date:</span><span class="val">${safeDate}</span></div>
        <div style="margin-top: 12px;">
          <span class="label">Prescribed Medications:</span>
          ${medListHtml}
        </div>
        ${safeNotes ? `<div style="margin-top: 12px;"><span class="label">Doctor Notes:</span><p style="margin: 4px 0 0; font-size: 13px; color: #334155;">${safeNotes}</p></div>` : ''}
      </div>

      <p>You can view and download your full official digital prescription and your personalized AI Care Summary directly in your patient dashboard.</p>
      <p style="margin-top: 24px;">Warm regards,<br><strong>MedSync Health Team</strong></p>
    `,
  });

  const text = `Hello ${safePatient},\n\nYour prescription and post-visit summary from ${safeDoctor} (${safeDate}) is ready in your MedSync patient dashboard.\n\nMedSync Health Team`;

  return { subject, html, text };
}




/**
 * Dispatch Email via Configured Provider (Resend, Mock)
 * 
 * Provider selection is driven by EMAIL_PROVIDER in environment variables:
 * - 'resend' (default): Sends via Resend Transactional API.
 * - 'mock' / 'console': Development / automated test runner mode.
 */
export async function sendEmail({ to, subject, html, text }) {
  if (!to) {
    throw new Error('Recipient email address is required.');
  }

  const provider = (config.email.provider || 'resend').toLowerCase();
  const fromEmail = process.env.EMAIL_FROM || config.email.from || 'MedSync Health <onboarding@resend.dev>';

  // ---------------------------------------------------------------------------
  // 1. Resend API Provider Adapter (Default)
  // ---------------------------------------------------------------------------
  if (provider === 'resend') {
    const apiKey = process.env.RESEND_API_KEY || config.email.resendApiKey;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not defined in environment variables.');
    }

    const client = resendClient || new Resend(apiKey);

    console.log(
      '\x1b[36m%s\x1b[0m',
      `🚀 [Resend Dispatch] Sending email to: ${to} | From: ${fromEmail} | Subject: "${subject}"`
    );

    const result = await client.emails.send({
      from: fromEmail,
      to: [to],
      subject,
      html,
      text,
    });

    if (result.error) {
      const errorMsg = result.error.message || JSON.stringify(result.error);
      console.error('✗ [Resend Delivery Error]:', errorMsg);
      throw new Error(`Resend API Error: ${errorMsg}`);
    }

    console.log(
      '\x1b[32m%s\x1b[0m',
      `✓ [Resend Success] Email delivered! ID: ${result.data?.id}`
    );

    return {
      success: true,
      provider: 'resend',
      messageId: result.data?.id,
    };
  }

  // ---------------------------------------------------------------------------
  // 2. Mock / Console Provider (Used in test suites / offline development)
  // ---------------------------------------------------------------------------
  if (provider === 'mock' || provider === 'console') {
    const mockId = `mock_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    console.log(
      '\x1b[36m%s\x1b[0m',
      `📧 [Mock Email Dispatch] To: ${to} | Subject: "${subject}" | ID: ${mockId}`
    );

    return {
      success: true,
      provider: 'mock',
      messageId: mockId,
    };
  }

  throw new Error(`Unsupported EMAIL_PROVIDER: "${provider}". Valid options are 'resend' or 'mock'.`);
}

