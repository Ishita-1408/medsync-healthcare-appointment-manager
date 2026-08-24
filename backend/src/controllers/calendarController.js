import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';
import {
  generateAuthUrl,
  handleOAuthCallback,
  disconnectUserCalendar,
  syncAppointmentUserEvent,
  syncAllUserAppointments,
} from '../services/calendarService.js';

const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey || config.supabase.anonKey
);

/**
 * Generate Google OAuth Consent URL
 * @route GET /api/calendar/auth
 */
export async function getCalendarAuthUrl(req, res, next) {
  try {
    const userId = req.user.id;
    const returnPath = req.query.returnPath || '/';
    console.log(
      '\x1b[36m%s\x1b[0m',
      `[OAuth Start] userId present: ${Boolean(userId)}, returnPath: ${returnPath}`
    );

    const url = generateAuthUrl({ userId, returnPath });

    return res.status(200).json({
      success: true,
      authUrl: url,
    });
  } catch (err) {
    console.error('✗ [OAuth Start Error]:', err.message);
    next(err);
  }
}

/**
 * Handle Google OAuth Redirect Callback
 * @route GET /api/calendar/auth/callback
 */
export async function handleGoogleOAuthCallback(req, res, next) {
  try {
    const { code, state, error } = req.query;

    console.log(
      '\x1b[36m%s\x1b[0m',
      `[OAuth Callback] code present: ${Boolean(code)}, state present: ${Boolean(state)}`
    );

    let stateUserId = null;
    let returnPath = '/';

    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
        stateUserId = decoded.userId || null;
        returnPath = decoded.returnPath || '/';
      } catch {
        stateUserId = state;
      }
    }

    if (error) {
      console.warn('⚠️ [OAuth Callback Error from Google]:', error);
      return res.redirect(`${config.clientUrl}${returnPath}?calendar_error=${encodeURIComponent(error)}`);
    }

    if (!code || !stateUserId) {
      console.warn('⚠️ [OAuth Callback Missing Param]: code or state missing');
      return res.redirect(`${config.clientUrl}${returnPath}?calendar_error=missing_code_or_state`);
    }

    // Exchange token and persist to database
    const { googleEmail } = await handleOAuthCallback(code, stateUserId);

    // Redirect to frontend with success banner flag
    const sep = returnPath.includes('?') ? '&' : '?';
    const redirectTarget = `${config.clientUrl}${returnPath}${sep}calendar_connected=true`;
    console.log(
      '\x1b[32m%s\x1b[0m',
      `[OAuth Complete] redirect: ${returnPath}, googleEmail present: ${Boolean(googleEmail)}`
    );
    return res.redirect(redirectTarget);
  } catch (err) {
    console.error('✗ [OAuth Callback Processing Error]:', err.message);
    const returnPath = req.query?.returnPath || '/';
    return res.redirect(`${config.clientUrl}${returnPath}?calendar_error=${encodeURIComponent(err.message)}`);
  }
}

/**
 * Check User Google Calendar Connection Status
 * @route GET /api/calendar/status
 */
export async function getCalendarConnectionStatus(req, res, next) {
  try {
    const userId = req.user.id;

    const { data: record, error } = await supabaseAdmin
      .from('user_calendar_tokens')
      .select('is_connected, google_email, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn(`[Calendar Status Query Notice]: ${error.message}`);
    }

    const isConnected = Boolean(record?.is_connected);
    const googleEmail = isConnected ? (record?.google_email || null) : null;

    console.log(
      '\x1b[36m%s\x1b[0m',
      `[Calendar Status Check] userId present: true -> isConnected: ${isConnected}, googleEmail present: ${Boolean(googleEmail)}`
    );

    return res.status(200).json({
      success: true,
      isConnected,
      googleEmail,
      updatedAt: record?.updated_at || null,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Disconnect Google Calendar
 * @route POST /api/calendar/disconnect
 */
export async function disconnectCalendar(req, res, next) {
  try {
    const userId = req.user.id;
    console.log('\x1b[33m%s\x1b[0m', `[Calendar Disconnect] userId: ${userId}`);
    await disconnectUserCalendar(userId);

    return res.status(200).json({
      success: true,
      message: 'Google Calendar successfully disconnected.',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Sync Specific Appointment to Google Calendar
 * @route POST /api/calendar/sync/:appointmentId
 */
export async function syncAppointment(req, res, next) {
  try {
    const { appointmentId } = req.params;
    const { action = 'create' } = req.body;
    const userId = req.user.id;
    const authHeader = req.headers.authorization;

    console.log(
      '\x1b[36m%s\x1b[0m',
      `[Calendar Sync Request] apptId: ${appointmentId}, userId: ${userId}, action: ${action}`
    );

    const result = await syncAppointmentUserEvent(appointmentId, userId, action, authHeader);

    return res.status(200).json({
      success: result.success !== false,
      data: result,
    });
  } catch (err) {
    console.error('✗ [Calendar Sync Error]:', err.message);
    next(err);
  }
}

/**
 * Sync All Upcoming Appointments to Google Calendar
 * @route POST /api/calendar/sync-all
 */
export async function syncAllAppointments(req, res, next) {
  try {
    const userId = req.user.id;
    const authHeader = req.headers.authorization;

    console.log('\x1b[36m%s\x1b[0m', `[Calendar Sync All] userId: ${userId}`);
    const result = await syncAllUserAppointments(userId, authHeader);

    return res.status(200).json({
      success: true,
      data: result,
      message: `Synchronized ${result.syncedCount} of ${result.total} upcoming appointments.`,
    });
  } catch (err) {
    console.error('✗ [Calendar Sync All Error]:', err.message);
    next(err);
  }
}


