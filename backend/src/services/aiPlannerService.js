const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4.1-mini';

const SYSTEM_PROMPT = `You are Khalid, a tourism planner for Bahrain.

Your job is to generate a realistic ONE-DAY plan.

Rules:
- Create ONLY a one-day plan.
- Do NOT create multi-day itineraries.
- Use ONLY the provided places.
- Do NOT invent places.
- Keep the plan practical and realistic.

Output format:
Morning:
- place + short reason

Afternoon:
- place + short reason

Evening:
- place + short reason

Keep the response clear, concise, and human-readable. Output plain text with sections (Morning / Afternoon / Evening), not JSON.`;

export function buildPlacesContext(places) {
  if (!places || places.length === 0) {
    return 'No places were found. Suggest the user to try different preferences or a broader query.';
  }
  const lines = places.map((p, i) => {
    const parts = [`${i + 1}. ${p.place_name} — ${p.description || 'No description'}`];
    if (p.category) parts.push(`Category: ${p.category}`);
    if (p.vibe) parts.push(`Vibe: ${p.vibe}`);
    if (p.price_range) parts.push(`Price: ${p.price_range}`);
    if (p.rating != null) parts.push(`Rating: ${p.rating}`);
    if (p.location) parts.push(`Location: ${p.location}`);
    return parts.join('. ');
  });
  return `Available places:\n${lines.join('\n')}`;
}

export async function generateDayPlan(userMessage, placesContext) {
  const userContent = `Context:\n${placesContext}\n\nUser request: ${userMessage}\n\nGenerate a one-day plan using only the places listed above.`;

  const res = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.6,
      max_tokens: 512,
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message || `OpenAI chat error (${res.status})`);
  }

  const text = json?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty response from planner');
  return text;
}
