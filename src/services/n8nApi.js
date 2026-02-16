import { N8N_WEBHOOK_URL } from '../config/n8n';

/**
 * Payload your n8n webhook expects.
 * Your workflow's "User input" (webhook) should receive a JSON body.
 * Adjust keys if your n8n trigger expects different field names.
 */
const buildPayload = (message, options = {}) => ({
  message: message || '',
  type: options.type || undefined, // 'plan' | 'post' | 'chat' | 'compare' – optional hint for routing
  ...options.extra,
});

/**
 * Call the n8n workflow webhook.
 * @param {string} message - User message or prompt (e.g. plan criteria, post body, chat text).
 * @param {{ type?: string, extra?: object }} options - Optional type hint and extra payload.
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
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();

    if (!response.ok) {
      const raw = text || response.statusText || '';
      let error = '';
      if (response.status === 500) {
        if (/unused.*respond to webhook/i.test(raw)) {
          error = 'n8n: "Unused Respond to Webhook node". Remove the Respond to Webhook node from the workflow. Then set the Webhook trigger to "When last node finishes" and make the last node in the Chat branch output {"output": "your reply"}.';
        } else if (/error in workflow/i.test(raw)) {
          try {
            const parsed = JSON.parse(raw);
            const msg = parsed.message || raw;
            error = `n8n workflow error: ${msg}. Check the workflow execution in n8n to see which node failed.`;
          } catch {
            error = `n8n workflow error. Check the workflow execution in n8n to see which node failed. Response: ${raw.slice(0, 200)}`;
          }
        } else {
          error = `n8n server error (500). Check the workflow execution in n8n. Response: ${raw.slice(0, 200)}`;
        }
      } else if (response.status === 404) {
        error = `n8n webhook not found (404). Make sure the workflow is Active in n8n.`;
      } else {
        error = `n8n returned ${response.status}: ${raw.slice(0, 200)}`;
      }
      return { success: false, error };
    }

    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json') && text && text.trim()) {
      try {
        data = JSON.parse(text);
      } catch (_) {
        data = { output: text };
      }
    } else {
      data = text ? { output: text } : {};
    }

    return { success: true, data };
  } catch (e) {
    return {
      success: false,
      error: e.message || 'Network error calling n8n',
    };
  }
}

/**
 * Request an AI-generated itinerary from the n8n Planning Agent.
 * Sends a prompt built from budget, preferences, and days; returns parsed places if available.
 *
 * @param {{ budget: string, preferences: string[], days: string }} answers
 * @returns {Promise<{ success: boolean, places?: Array<{ id, day, coordinate, title, description }>, output?: string, error?: string }>}
 */
export async function requestPlanFromN8n(answers) {
  const { budget = '', preferences = [], days = '' } = answers || {};
  const prefs = Array.isArray(preferences) ? preferences.join(', ') : String(preferences);
  const message = [
    'Create an itinerary for Bahrain.',
    budget && `Budget: ${budget}.`,
    prefs && `Interests: ${prefs}.`,
    days && `Duration: ${days}.`,
  ]
    .filter(Boolean)
    .join(' ');

  const result = await sendToN8n(message, { type: 'plan' });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  // n8n can return: direct body, { data }, { output }, or { json: { places } } from last node
  const raw =
    result.data?.data ??
    result.data?.json ??
    result.data?.output ??
    result.data?.body ??
    result.data;
  const parsed = parsePlanResponse(raw);
  const hasPlaces = parsed.places?.length > 0;
  const msg = result.data?.message ?? result.data?.msg;
  const isWorkflowStartedOnly =
    !hasPlaces && msg && String(msg).toLowerCase().includes('workflow') && String(msg).toLowerCase().includes('started');
  const errorHint = isWorkflowStartedOnly
    ? "Your n8n workflow ran but didn't send the plan back. Add a 'Respond to Webhook' node at the end and return JSON: { \"places\": [ { \"latitude\": 26.22, \"longitude\": 50.58, \"title\": \"Spot name\", \"description\": \"...\" }, ... ] }"
    : !hasPlaces
      ? "Your n8n workflow must use 'Respond to Webhook' and return JSON with a 'places' array. Each place needs: latitude, longitude, title, description."
      : undefined;
  return {
    success: true,
    places: parsed.places,
    output: parsed.output ?? (typeof raw === 'string' ? raw : JSON.stringify(raw)),
    error: hasPlaces ? undefined : errorHint,
  };
}

/**
 * Check if an object looks like a place (has coordinates).
 */
function hasCoords(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const lat = obj.latitude ?? obj.lat ?? obj.coordinate?.latitude;
  const lng = obj.longitude ?? obj.lng ?? obj.coordinate?.longitude;
  return lat != null && lng != null;
}

/**
 * Recursively find first array of objects that have latitude/longitude.
 */
function findPlacesArray(obj, depth = 0) {
  if (depth > 10) return null;
  if (!obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    const withCoords = obj.filter((item) => hasCoords(item?.json ?? item?.data ?? item));
    if (withCoords.length > 0) return withCoords.map((item) => item?.json ?? item?.data ?? item);
    return null;
  }
  for (const key of ['places', 'itinerary', 'stops', 'points', 'results', 'data', 'items', 'json']) {
    const val = obj[key];
    if (Array.isArray(val)) {
      const withCoords = val.filter((item) => hasCoords(item?.json ?? item?.data ?? item));
      if (withCoords.length > 0) return withCoords.map((item) => item?.json ?? item?.data ?? item);
      const withCoordsDirect = val.filter((item) => hasCoords(item));
      if (withCoordsDirect.length > 0) return withCoordsDirect;
    }
    if (val && typeof val === 'object') {
      const found = findPlacesArray(val, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Parse n8n plan response into our app's plan point shape.
 * Handles: JSON array of places, or object with places/output, or nested/any structure with coords.
 */
function parsePlanResponse(raw) {
  if (!raw) return { places: [], output: '' };

  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return { places: [], output: raw };
    }
  }

  // 1) Known keys
  const knownArr = data?.places ?? data?.itinerary ?? data?.stops ?? data?.points;
  if (Array.isArray(knownArr) && knownArr.length > 0) {
    const places = knownArr.map((p, i) => toPlanPoint(p, i + 1)).filter(Boolean);
    if (places.length > 0) return { places, output: data.output ?? data.text ?? '' };
  }

  // 2) n8n execution: array of items with .json
  if (Array.isArray(data)) {
    const first = data[0];
    const payload = first?.json ?? first?.data ?? first;
    if (payload && typeof payload === 'object') {
      const arr = payload.places ?? payload.itinerary ?? payload.stops ?? payload.points;
      if (Array.isArray(arr)) {
        const places = arr.map((p, i) => toPlanPoint(p, i + 1)).filter(Boolean);
        if (places.length > 0) return { places, output: payload.output ?? payload.text ?? '' };
      }
    }
    const places = data.map((p, i) => toPlanPoint(p?.json ?? p?.data ?? p, i + 1)).filter(Boolean);
    if (places.length > 0) return { places, output: '' };
  }

  // 3) Recursive search for any array of objects with coordinates
  const found = findPlacesArray(data);
  if (found && found.length > 0) {
    const places = found.map((p, i) => toPlanPoint(p, i + 1)).filter(Boolean);
    if (places.length > 0) return { places, output: '' };
  }

  if (typeof data !== 'object') return { places: [], output: String(raw) };

  const output = data.output ?? data.text ?? data.summary ?? '';
  return { places: [], output };
}

function toPlanPoint(p, day) {
  if (!p) return null;
  const lat = p.latitude ?? p.lat ?? p.coordinate?.latitude;
  const lng = p.longitude ?? p.lng ?? p.coordinate?.longitude;
  if (lat == null || lng == null) return null;
  return {
    id: p.id ?? `day${day}`,
    day,
    coordinate: { latitude: Number(lat), longitude: Number(lng) },
    title: p.title ?? p.name ?? `Spot ${day}`,
    description: p.description ?? p.subtitle ?? '',
  };
}

/**
 * Chat with the n8n workflow (e.g. Khalid Chatbot agent). Sends message and returns reply text.
 * @param {string} message - User message.
 * @returns {Promise<{ success: boolean, text?: string, error?: string }>}
 */
export async function sendChatToN8n(message) {
  const result = await sendToN8n(message, { type: 'chat' });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const data = result.data;
  if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
    return {
      success: true,
      text: 'No reply from n8n yet. In your workflow: Webhook → "When last node finishes". Last node in the Chat branch must output: {"output": "your reply text"}.',
    };
  }

  const text = extractChatText(data);
  const isWorkflowStartedOnly = /workflow was started/i.test(text);
  if (isWorkflowStartedOnly) {
    return {
      success: true,
      text: 'Request received by n8n but no reply was sent. Set the Webhook to "When last node finishes" and make the last node in the Chat branch output: {"output": "your reply text"}.',
    };
  }

  return { success: true, text: text || 'No response from assistant.' };
}

/** Extract reply text from n8n response (handles various shapes). */
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

/**
 * Submit a community post to n8n (e.g. for moderation, AI summary, or storage).
 * @param {{ body: string, topicId?: string }} post
 */
export async function submitPostToN8n(post) {
  const message = [post.body, post.topicId && `Topic: ${post.topicId}`].filter(Boolean).join('\n');
  return sendToN8n(message, { type: 'post', extra: { topicId: post.topicId } });
}
