import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  getCalendarAuthUrl,
  handleGoogleOAuthCallback,
  getCalendarConnectionStatus,
  disconnectCalendar,
  syncAppointment,
  syncAllAppointments,
} from '../controllers/calendarController.js';

const router = Router();

/**
 * @route GET /api/calendar/auth
 * @desc Get Google OAuth 2.0 consent URL for authenticated user
 * @access Private
 */
router.get('/auth', requireAuth, getCalendarAuthUrl);

/**
 * @route GET /api/calendar/auth/callback
 * @desc Google OAuth 2.0 redirect callback endpoint
 * @access Public (Redirect from Google)
 */
router.get('/auth/callback', handleGoogleOAuthCallback);

/**
 * @route GET /api/calendar/status
 * @desc Get user's Google Calendar connection status
 * @access Private
 */
router.get('/status', requireAuth, getCalendarConnectionStatus);

/**
 * @route POST /api/calendar/disconnect
 * @desc Disconnect user's Google Calendar
 * @access Private
 */
router.post('/disconnect', requireAuth, disconnectCalendar);

/**
 * @route POST /api/calendar/sync/:appointmentId
 * @desc Synchronize an appointment to Google Calendar
 * @access Private
 */
router.post('/sync/:appointmentId', requireAuth, syncAppointment);

/**
 * @route POST /api/calendar/sync-all
 * @desc Synchronize all upcoming user appointments to Google Calendar
 * @access Private
 */
router.post('/sync-all', requireAuth, syncAllAppointments);

export default router;
