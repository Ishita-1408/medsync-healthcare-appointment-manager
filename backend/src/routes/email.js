import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../middleware/auth.js';
import { config } from '../config/index.js';

const router = Router();
const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey || config.supabase.anonKey
);

/**
 * @route GET /api/email/status/:jobId
 * @desc Get email delivery job status
 * @access Private (Authenticated Recipient or Admin)
 */
router.get('/status/:jobId', requireAuth, async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.id;

    const { data: job, error } = await supabaseAdmin
      .from('email_jobs')
      .select('id, appointment_id, recipient_id, email_type, subject, status, attempts, next_retry_at, sent_at, created_at')
      .eq('id', jobId)
      .maybeSingle();

    if (error || !job) {
      return res.status(404).json({
        success: false,
        error: 'Email job not found.',
      });
    }

    if (job.recipient_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You do not have permission to view this email job.',
      });
    }

    return res.status(200).json({
      success: true,
      data: job,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route POST /api/email/test
 * @desc Safe test email dispatch endpoint
 * @access Private (Authenticated User)
 */
router.post('/test', requireAuth, async (req, res, next) => {
  try {
    const { to_email, email_type = 'BOOKING_CONFIRMATION' } = req.body;
    const recipientEmail = to_email || req.user.email;

    if (!recipientEmail) {
      return res.status(400).json({
        success: false,
        error: 'Recipient email address is required.',
      });
    }

    const {
      sendEmail,
      getBookingConfirmationTemplate,
      getReminder24hTemplate,
      getCancellationTemplate,
      getPrescriptionReadyTemplate,
    } = await import('../services/emailService.js');

    let template;
    switch (email_type) {
      case 'APPOINTMENT_REMINDER_24H':
        template = getReminder24hTemplate({
          patientName: 'Test Patient',
          doctorName: 'Dr. Angel Priya',
          doctorSpecialty: 'General Medicine',
          dateStr: 'Tomorrow, Aug 25, 2026',
          timeStr: '11:30 AM',
        });
        break;
      case 'APPOINTMENT_CANCELLATION':
        template = getCancellationTemplate({
          patientName: 'Test Patient',
          doctorName: 'Dr. Angel Priya',
          doctorSpecialty: 'General Medicine',
          dateStr: 'Aug 25, 2026',
          timeStr: '11:30 AM',
        });
        break;
      case 'PRESCRIPTION_READY':
        template = getPrescriptionReadyTemplate({
          patientName: 'Test Patient',
          doctorName: 'Dr. Angel Priya',
          dateStr: 'Today',
          medications: [{ name: 'Metformin', strength: '1000mg', dosage: '1 tablet', frequency: 'Twice daily' }],
        });
        break;
      default:
        template = getBookingConfirmationTemplate({
          patientName: 'Test Patient',
          doctorName: 'Dr. Angel Priya',
          doctorSpecialty: 'General Medicine',
          dateStr: 'Aug 25, 2026',
          timeStr: '11:30 AM',
        });
    }

    const sendResult = await sendEmail({
      to: recipientEmail,
      subject: `[MedSync Test] ${template.subject}`,
      html: template.html,
      text: template.text,
    });

    return res.status(200).json({
      success: true,
      data: {
        recipient: recipientEmail,
        type: email_type,
        provider: sendResult.provider,
        messageId: sendResult.messageId,
        subject: `[MedSync Test] ${template.subject}`,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;

