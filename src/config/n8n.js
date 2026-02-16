/**
 * n8n webhook – n8n is on your VPS.
 *
 * n8n often shows "localhost" in the Webhook node. Ignore that. Use your VPS address instead:
 *
 *   https://YOUR_VPS_DOMAIN_OR_IP/webhook/c25923f4-eab7-4e91-97c3-ce7029e2a486
 *
 * Examples:
 *   https://n8n.mydomain.com/webhook/c25923f4-eab7-4e91-97c3-ce7029e2a486
 *   https://123.45.67.89/webhook/c25923f4-eab7-4e91-97c3-ce7029e2a486
 *
 * Replace YOUR_VPS_DOMAIN_OR_IP below with how you access n8n in the browser (no trailing slash).
 * Or set EXPO_PUBLIC_N8N_WEBHOOK_URL in .env.
 */
export const N8N_WEBHOOK_URL =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_N8N_WEBHOOK_URL) ||
  'http://72.61.111.217:5679/webhook/hello';

