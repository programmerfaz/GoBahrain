/**
 * n8n Cloud webhook configuration for GoBahrain.
 *
 * Production URL for the "Khalid chatbot" workflow.
 * The webhook node has path "chat", method POST, no auth.
 */

export const N8N_WEBHOOK_URL =
  process.env.EXPO_PUBLIC_N8N_WEBHOOK_URL ||
  'https://gobahrain.app.n8n.cloud/webhook/chat';
