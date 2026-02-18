const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';

/**
 * Direct fetch to OpenAI embeddings — same approach as the frontend.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function createEmbedding(text) {
  const input = (text || '').trim() || 'things to do in Bahrain';

  const res = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input,
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message || `OpenAI error (${res.status})`);
  }

  const vector = json?.data?.[0]?.embedding;
  if (!vector || !Array.isArray(vector)) {
    throw new Error('No embedding returned from OpenAI');
  }
  return vector;
}
