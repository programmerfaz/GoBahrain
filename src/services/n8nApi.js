import { N8N_WEBHOOK_URL } from '../config/n8n';

/**
 * Build the payload the n8n webhook expects.
 * The "User input" / Webhook trigger receives a JSON body with a "message" field.
 */
const buildPayload = (message, options = {}) => ({
  message: message || '',
  sessionId: options.sessionId || undefined,
  type: options.type || undefined,
  ...options.extra,
});

/**
 * Low-level: call the n8n workflow webhook.
 * @param {string} message - User message or prompt.
 * @param {{ type?: string, extra?: object }} options
 * @returns {Promise<{ success: boolean, data?: any, error?: string }>}
 */
export async function sendToN8n(message, options = {}) {
  const url = N8N_WEBHOOK_URL;
  if (!url || url.includes('your-n8n-instance')) {
    return {
      success: false,
      error: 'N8N webhook URL not configured. Set EXPO_PUBLIC_N8N_WEBHOOK_URL or edit src/config/n8n.js',
    };
  }

  try {
    const payload = buildPayload(message, options);
    console.log('[n8n] POST →', url, JSON.stringify(payload));

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    console.log('[n8n] Status:', response.status, '| Body length:', text.length, '| Body:', text.slice(0, 300));

    if (!response.ok) {
      const raw = text || response.statusText || '';
      let error;
      if (response.status === 404) {
        error = 'n8n webhook not found (404). Make sure the workflow is Active/Published in n8n.';
      } else if (response.status === 500) {
        error = `n8n server error (500). Check the workflow execution in n8n. Response: ${raw.slice(0, 200)}`;
      } else {
        error = `n8n returned ${response.status}: ${raw.slice(0, 200)}`;
      }
      return { success: false, error };
    }

    if (!text || !text.trim()) {
      console.warn('[n8n] Webhook returned 200 but empty body.');
      return { success: true, data: {} };
    }

    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { output: text };
      }
    } else {
      data = { output: text };
    }

    console.log('[n8n] Parsed data:', JSON.stringify(data).slice(0, 300));
    return { success: true, data };
  } catch (e) {
    console.error('[n8n] Fetch error:', e);
    return {
      success: false,
      error: e.message || 'Network error calling n8n',
    };
  }
}

let _chatSessionId = null;

/** Get or create a persistent session ID for the current chat session. */
export function getChatSessionId() {
  if (!_chatSessionId) {
    _chatSessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  return _chatSessionId;
}

/** Reset the session (e.g. when user clears chat). */
export function resetChatSession() {
  _chatSessionId = null;
}

/**
 * Chat with the n8n "Khalid Chatbot" agent.
 * Sends the user's message and returns the reply text from the "output" field.
 * Includes a sessionId so n8n's Memory node can track conversation history.
 *
 * Expected n8n response shape (from Respond to Webhook node):
 *   { "output": "If you're craving a tasty burger..." }
 *
 * @param {string} message - User chat message.
 * @param {string} [sessionId] - Optional session ID (auto-generated if omitted).
 * @returns {Promise<{ success: boolean, text?: string, error?: string }>}
 */
export async function sendChatToN8n(message, sessionId) {
  const sid = sessionId || getChatSessionId();
  const result = await sendToN8n(message, { type: 'chat', sessionId: sid });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const data = result.data;
  if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
    return {
      success: false,
      error:
        'Khalid received your message but sent back an empty reply. ' +
        'In n8n: (1) Make sure the workflow is Published (not just saved). ' +
        '(2) Check Executions tab for errors. ' +
        '(3) Verify the "Respond to Webhook" node has data flowing into it.',
    };
  }

  const text = extractChatText(data);

  if (/workflow was started/i.test(text)) {
    return {
      success: true,
      text: 'Request received by n8n but no reply came back. Set the Webhook to "Using Respond to Webhook Node" mode.',
    };
  }

  // Itinerary/planning flow returns { success, clients } without "output" – show all places as bullet points
  if (!text && data.success === true && Array.isArray(data.clients) && data.clients.length > 0) {
    const bullets = data.clients
      .map((c) => `• ${c.business_name || c.title || c.name || 'A place'}`)
      .join('\n');
    return {
      success: true,
      text: `Found ${data.clients.length} place(s) for your itinerary:\n\n${bullets}`,
    };
  }

  return { success: true, text: text || 'No response from Khalid.' };
}

/**
 * Extract the reply text from various n8n response shapes.
 * Primary: data.output (matches your Respond to Webhook config).
 */
function extractChatText(data) {
  if (data == null) return '';
  if (typeof data === 'string') return data;

  const keys = ['output', 'text', 'message', 'reply', 'content', 'response', 'result'];
  for (const k of keys) {
    const v = data[k];
    if (typeof v === 'string' && v.trim()) return v;
  }

  if (Array.isArray(data)) {
    const first = data[0];
    const item = first?.json ?? first?.data ?? first;
    if (item && typeof item === 'object') {
      for (const k of keys) {
        const v = item[k];
        if (typeof v === 'string' && v.trim()) return v;
      }
    }
    if (typeof first === 'string') return first;
  }

  if (data.json && typeof data.json === 'object') {
    for (const k of keys) {
      const v = data.json[k];
      if (typeof v === 'string' && v.trim()) return v;
    }
  }

  if (data.data) return extractChatText(data.data);
  if (data.body && typeof data.body === 'string') return data.body;

  return '';
}
