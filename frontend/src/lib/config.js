/**
 * MedSync Frontend Environment & API Configuration
 * 
 * Prioritizes VITE_API_URL from environment variables (configured in Vercel/Vite).
 * Falls back to the production Render backend in production builds,
 * and to http://localhost:5000/api in local development.
 */

export const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD
    ? 'https://medsync-healthcare-appointment-manager.onrender.com/api'
    : 'http://localhost:5000/api');

/**
 * Helper to build full backend endpoint URLs cleanly
 * @param {string} endpoint - e.g. '/calendar/status' or 'ai/pre-visit-summary'
 * @returns {string} - Full API URL
 */
export function getApiEndpoint(endpoint = '') {
  const base = API_BASE_URL.replace(/\/+$/, '');
  const cleanEndpoint = endpoint.replace(/^\/+/, '');
  return cleanEndpoint ? `${base}/${cleanEndpoint}` : base;
}
