import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';

if (!config.supabase.serviceRoleKey) {
  console.warn(
    '\x1b[33m%s\x1b[0m',
    '⚠️  [Calendar Service Warning]: SUPABASE_SERVICE_ROLE_KEY is not defined in backend/.env. Using anon key with user JWT context.'
  );
}

const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey || config.supabase.anonKey
);

/**
 * Creates a Supabase client with user's JWT if available
 */
function getClientWithAuth(authHeader) {
  if (!authHeader) return supabaseAdmin;
  return createClient(config.supabase.url, config.supabase.anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
}

/**
 * Instantiate Google OAuth2 Client
 */
function getBaseOAuth2Client() {
  return new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri
  );
}

/**
 * Generate Google OAuth 2.0 Authorization URL
 */
export function generateAuthUrl(stateData) {
  if (!config.google.clientId || !config.google.clientSecret) {
    throw new Error('Google OAuth credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) are not configured in backend/.env.');
  }

  const oauth2Client = getBaseOAuth2Client();

  const scopes = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.email',
  ];

  const stateStr = typeof stateData === 'object'
    ? Buffer.from(JSON.stringify(stateData)).toString('base64url')
    : String(stateData);

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
    state: stateStr,
  });
}

/**
 * Handle OAuth 2.0 Authorization Code Exchange & Persistence
 */
export async function handleOAuthCallback(code, stateUserId) {
  if (!code || !stateUserId) {
    throw new Error('Missing authorization code or user identification state.');
  }

  const oauth2Client = getBaseOAuth2Client();
  
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  console.log('\x1b[32m%s\x1b[0m', `✓ [OAuth Token Exchange] success: true, refresh_token_received: ${Boolean(tokens.refresh_token)}`);

  let googleEmail = null;
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();
    googleEmail = data.email || null;
    console.log('\x1b[32m%s\x1b[0m', `✓ [OAuth Account] googleEmail present: ${Boolean(googleEmail)}`);
  } catch (err) {
    console.warn('⚠️ [OAuth Account Warning] Could not fetch Google user email:', err.message);
  }

  const tokenPayload = {
    user_id: stateUserId,
    provider: 'google',
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
    scope: tokens.scope,
    google_email: googleEmail,
    is_connected: true,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from('user_calendar_tokens')
    .upsert(tokenPayload, { onConflict: 'user_id' });

  if (error) {
    console.error('✗ [OAuth Token Persistence Error]:', error.message);
    throw new Error(`Database error persisting calendar tokens: ${error.message}`);
  }

  console.log('\x1b[32m%s\x1b[0m', `✓ [OAuth Token Persistence] success: true for user: ${stateUserId}`);

  return { success: true, googleEmail };
}

/**
 * Get authenticated Google OAuth2 Client for a specific user
 */
export async function getAuthenticatedClient(userId) {
  const { data: tokenRecord, error } = await supabaseAdmin
    .from('user_calendar_tokens')
    .select('*')
    .eq('user_id', userId)
    .eq('is_connected', true)
    .maybeSingle();

  if (error || !tokenRecord || !tokenRecord.refresh_token) {
    console.warn(`[Calendar Auth] User ${userId} has not connected calendar or missing refresh token.`);
    return null;
  }

  const oauth2Client = getBaseOAuth2Client();
  oauth2Client.setCredentials({
    access_token: tokenRecord.access_token,
    refresh_token: tokenRecord.refresh_token,
    expiry_date: tokenRecord.expiry_date,
  });

  oauth2Client.on('tokens', async (newTokens) => {
    const updatePayload = {
      access_token: newTokens.access_token,
      expiry_date: newTokens.expiry_date,
      updated_at: new Date().toISOString(),
    };
    if (newTokens.refresh_token) {
      updatePayload.refresh_token = newTokens.refresh_token;
    }

    await supabaseAdmin
      .from('user_calendar_tokens')
      .update(updatePayload)
      .eq('user_id', userId);
  });

  return oauth2Client;
}

/**
 * Create, Update, or Delete a Google Calendar Event for an Appointment
 */
export async function syncAppointmentUserEvent(appointmentId, userId, action = 'create', authHeader = null) {
  try {
    console.log(
      '\x1b[36m%s\x1b[0m',
      `[Calendar Sync Service] Starting sync: apptId=${appointmentId}, userId=${userId}, action=${action}`
    );

    const authClient = await getAuthenticatedClient(userId);
    if (!authClient) {
      console.warn(`[Calendar Sync Service] Skipping: User ${userId} is not connected to Google Calendar.`);
      return { skipped: true, reason: 'NOT_CONNECTED' };
    }

    const calendar = google.calendar({ version: 'v3', auth: authClient });
    const client = getClientWithAuth(authHeader);

    // Fetch appointment record
    const { data: appt, error: apptErr } = await client
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .maybeSingle();

    if (apptErr || !appt) {
      console.warn('⚠️ [Calendar Sync Warning] Appointment not found in DB:', appointmentId, apptErr?.message);
      return { skipped: true, reason: 'APPOINTMENT_NOT_FOUND', error: apptErr?.message };
    }

    console.log(
      '\x1b[36m%s\x1b[0m',
      `[Calendar Sync Service] Appointment found: status=${appt.status}, start=${appt.start_time}, end=${appt.end_time}`
    );

    // Fetch doctor and patient profile names
    const { data: profiles } = await client
      .from('profiles')
      .select('id, first_name, last_name')
      .in('id', [appt.doctor_id, appt.patient_id]);

    const docProfile = profiles?.find((p) => p.id === appt.doctor_id);
    const patProfile = profiles?.find((p) => p.id === appt.patient_id);

    const docName = docProfile ? `Dr. ${docProfile.first_name} ${docProfile.last_name}` : 'Physician';
    const patName = patProfile ? `${patProfile.first_name} ${patProfile.last_name}` : 'Patient';

    const eventSummary = `MedSync Consultation: ${docName} & ${patName}`;
    const eventDescription = `Healthcare appointment confirmed on MedSync.\nPhysician: ${docName}\nPatient: ${patName}\nStatus: ${appt.status}\n\nPlease be ready a few minutes ahead of time.`;

    // Check existing mapping
    const { data: existingMapping } = await client
      .from('appointment_calendar_events')
      .select('*')
      .eq('appointment_id', appointmentId)
      .eq('user_id', userId)
      .maybeSingle();

    // CASE 1: CANCEL
    if (action === 'cancel' || appt.status === 'CANCELLED') {
      let mainCancelled = false;
      if (existingMapping?.google_event_id) {
        try {
          await calendar.events.delete({
            calendarId: 'primary',
            eventId: existingMapping.google_event_id,
          });
          console.log(`[Google Calendar] Deleted event ${existingMapping.google_event_id} for user ${userId}`);
        } catch (delErr) {
          if (delErr.code !== 404 && delErr.code !== 410) {
            console.warn('Google event delete warning:', delErr.message);
          }
        }

        await client
          .from('appointment_calendar_events')
          .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
          .eq('id', existingMapping.id);

        mainCancelled = true;
      }

      // Also cancel counterparty's calendar event if connected
      const otherUserId = userId === appt.patient_id ? appt.doctor_id : appt.patient_id;
      if (otherUserId) {
        try {
          const { data: otherMapping } = await client
            .from('appointment_calendar_events')
            .select('*')
            .eq('appointment_id', appointmentId)
            .eq('user_id', otherUserId)
            .maybeSingle();

          if (otherMapping?.google_event_id) {
            const otherClient = await getAuthenticatedClient(otherUserId);
            if (otherClient) {
              const otherCal = google.calendar({ version: 'v3', auth: otherClient });
              try {
                await otherCal.events.delete({
                  calendarId: 'primary',
                  eventId: otherMapping.google_event_id,
                });
                console.log(`[Google Calendar] Deleted counterparty event ${otherMapping.google_event_id} for user ${otherUserId}`);
              } catch (delErr) {
                if (delErr.code !== 404 && delErr.code !== 410) {
                  console.warn('Counterparty event delete warning:', delErr.message);
                }
              }

              await client
                .from('appointment_calendar_events')
                .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
                .eq('id', otherMapping.id);
            }
          }
        } catch (otherCancelErr) {
          console.warn('[Calendar Sync Notice] Counterparty cancel notice:', otherCancelErr.message);
        }
      }

      return mainCancelled ? { success: true, action: 'cancelled' } : { skipped: true, reason: 'NO_EVENT_TO_CANCEL' };
    }

    // CASE 2: UPDATE (Reschedule)
    if (action === 'update' || action === 'reschedule') {
      let mainUpdated = false;
      let updatedHtmlLink = null;

      if (existingMapping?.google_event_id) {
        const updatedEvent = await calendar.events.patch({
          calendarId: 'primary',
          eventId: existingMapping.google_event_id,
          requestBody: {
            summary: eventSummary,
            description: eventDescription,
            start: { dateTime: new Date(appt.start_time).toISOString(), timeZone: 'Asia/Kolkata' },
            end: { dateTime: new Date(appt.end_time).toISOString(), timeZone: 'Asia/Kolkata' },
          },
        });

        await client
          .from('appointment_calendar_events')
          .update({
            status: 'RESCHEDULED',
            html_link: updatedEvent.data.htmlLink,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingMapping.id);

        mainUpdated = true;
        updatedHtmlLink = updatedEvent.data.htmlLink;
      }

      // Also update counterparty's calendar event if connected
      const otherUserId = userId === appt.patient_id ? appt.doctor_id : appt.patient_id;
      if (otherUserId) {
        try {
          const { data: otherMapping } = await client
            .from('appointment_calendar_events')
            .select('*')
            .eq('appointment_id', appointmentId)
            .eq('user_id', otherUserId)
            .maybeSingle();

          if (otherMapping?.google_event_id) {
            const otherClient = await getAuthenticatedClient(otherUserId);
            if (otherClient) {
              const otherCal = google.calendar({ version: 'v3', auth: otherClient });
              const otherUpdated = await otherCal.events.patch({
                calendarId: 'primary',
                eventId: otherMapping.google_event_id,
                requestBody: {
                  summary: eventSummary,
                  description: eventDescription,
                  start: { dateTime: new Date(appt.start_time).toISOString(), timeZone: 'Asia/Kolkata' },
                  end: { dateTime: new Date(appt.end_time).toISOString(), timeZone: 'Asia/Kolkata' },
                },
              });

              await client
                .from('appointment_calendar_events')
                .update({
                  status: 'RESCHEDULED',
                  html_link: otherUpdated.data.htmlLink,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', otherMapping.id);
              console.log(`[Google Calendar] Rescheduled counterparty event ${otherMapping.google_event_id} for user ${otherUserId}`);
            }
          }
        } catch (otherUpdateErr) {
          console.warn('[Calendar Sync Notice] Counterparty reschedule notice:', otherUpdateErr.message);
        }
      }

      return mainUpdated
        ? { success: true, action: 'updated', htmlLink: updatedHtmlLink }
        : { skipped: true, reason: 'NO_EVENT_TO_UPDATE' };
    }

    // CASE 3: CREATE (or replace if missing)
    if (!existingMapping?.google_event_id) {
      console.log(
        '\x1b[34m%s\x1b[0m',
        `[Google Calendar] Inserting event: calendarId=primary, summary="${eventSummary}", start=${appt.start_time}, end=${appt.end_time}`
      );

      const createdEvent = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: eventSummary,
          description: eventDescription,
          start: { dateTime: new Date(appt.start_time).toISOString(), timeZone: 'Asia/Kolkata' },
          end: { dateTime: new Date(appt.end_time).toISOString(), timeZone: 'Asia/Kolkata' },
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'popup', minutes: 24 * 60 },
              { method: 'popup', minutes: 120 },
            ],
          },
        },
      });

      console.log(
        '\x1b[32m%s\x1b[0m',
        `✓ [Google Calendar] Event created successfully! EventId=${createdEvent.data.id}`
      );

      const eventPayload = {
        appointment_id: appointmentId,
        user_id: userId,
        google_event_id: createdEvent.data.id,
        calendar_id: 'primary',
        status: 'CONFIRMED',
        html_link: createdEvent.data.htmlLink,
      };

      await client
        .from('appointment_calendar_events')
        .upsert(eventPayload, { onConflict: 'appointment_id,user_id' });

      // Automatically sync for the other participant (counterparty) if they have connected Google Calendar
      const otherUserId = userId === appt.patient_id ? appt.doctor_id : appt.patient_id;
      if (otherUserId) {
        try {
          const otherClient = await getAuthenticatedClient(otherUserId);
          if (otherClient) {
            console.log(`[Calendar Multi-User Sync] Also syncing event for counterparty user: ${otherUserId}`);
            const otherCal = google.calendar({ version: 'v3', auth: otherClient });
            const otherEvent = await otherCal.events.insert({
              calendarId: 'primary',
              requestBody: {
                summary: eventSummary,
                description: eventDescription,
                start: { dateTime: new Date(appt.start_time).toISOString(), timeZone: 'Asia/Kolkata' },
                end: { dateTime: new Date(appt.end_time).toISOString(), timeZone: 'Asia/Kolkata' },
                reminders: {
                  useDefault: false,
                  overrides: [
                    { method: 'popup', minutes: 24 * 60 },
                    { method: 'popup', minutes: 120 },
                  ],
                },
              },
            });
            await client
              .from('appointment_calendar_events')
              .upsert({
                appointment_id: appointmentId,
                user_id: otherUserId,
                google_event_id: otherEvent.data.id,
                calendar_id: 'primary',
                status: 'CONFIRMED',
                html_link: otherEvent.data.htmlLink,
              }, { onConflict: 'appointment_id,user_id' });
          }
        } catch (otherErr) {
          console.warn(`[Calendar Multi-User Sync Notice] Counterparty sync notice: ${otherErr.message}`);
        }
      }

      return {
        success: true,
        action: 'created',
        google_event_id: createdEvent.data.id,
        html_link: createdEvent.data.htmlLink,
      };
    }

    return { skipped: true, reason: 'ALREADY_SYNCED', google_event_id: existingMapping.google_event_id };
  } catch (err) {
    console.error(`✗ [Google Calendar Sync Error for user ${userId}]:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Sync all upcoming confirmed appointments for a user
 */
export async function syncAllUserAppointments(userId, authHeader = null) {
  const client = getClientWithAuth(authHeader);
  const nowIso = new Date().toISOString();

  const { data: appts, error } = await client
    .from('appointments')
    .select('id, start_time, status')
    .or(`patient_id.eq.${userId},doctor_id.eq.${userId}`)
    .gte('start_time', nowIso)
    .neq('status', 'CANCELLED');

  if (error || !appts) {
    return { syncedCount: 0, total: 0 };
  }

  let syncedCount = 0;
  for (const appt of appts) {
    const res = await syncAppointmentUserEvent(appt.id, userId, 'create', authHeader);
    if (res?.success) syncedCount++;
  }

  return { syncedCount, total: appts.length };
}

/**
 * Disconnect Google Calendar for a user
 */
export async function disconnectUserCalendar(userId) {
  const { error } = await supabaseAdmin
    .from('user_calendar_tokens')
    .update({
      is_connected: false,
      access_token: null,
      refresh_token: null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Database error disconnecting calendar: ${error.message}`);
  }

  return { success: true };
}

