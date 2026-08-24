import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';

const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey || config.supabase.anonKey
);

/**
 * Middleware to authenticate requests using Supabase Auth JWT
 */
export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Missing Bearer token.',
      });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired session token.',
      });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal authorization error.',
    });
  }
}
