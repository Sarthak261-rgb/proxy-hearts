// Minimal Gemini client: JSON-mode generation, a global requests-per-minute limiter, and retry on 429/5xx.
import fs from 'node:fs';
import path from 'node:path';

// Load .env without a dependency (Vercel injects env vars itself).
try {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]] && m[2]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch {}

const MODELS = (tier) =>
  (tier === 'fast'
    ? [process.env.GEMINI_FAST_MODEL, 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite', 'gemini-3.8-flash']
    : [process.env.GEMINI_MODEL, 'gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-flash-latest']
  ).filter((m, i, a) => m && a.indexOf(m) === i);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Space requests evenly so a whole batch run stays under the tier's RPM.
const nextSlot = {};
async function rateLimit(model) {
  const rpm = Number(process.env.LLM_RPM || 10);
  const gap = 60000 / rpm;
  const now = Date.now();
  const slot = nextSlot[model] || 0;
  const wait = Math.max(0, slot - now);
  nextSlot[model] = Math.max(now, slot) + gap;
  if (wait) await sleep(wait);
}

export function hasKey() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function generateJSON({ system, prompt, temperature = 0.8, maxTokens = 2048, tier = 'smart' }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set on the server');
  let lastErr;
  for (const model of MODELS(tier)) {
    for (let attempt = 0; attempt < 4; attempt++) {
      await rateLimit(model);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature,
              maxOutputTokens: maxTokens,
              responseMimeType: 'application/json',
              // Fast, low-latency replies: dates are conversation, not math.
              ...(/gemini-3|latest/.test(model) ? { thinkingConfig: { thinkingLevel: 'low' } } : {}),
            },
          }),
          signal: AbortSignal.timeout(60000),
        }
      ).catch((e) => ({ ok: false, status: 0, text: async () => e.message }));

      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
        try {
          return parseLooseJSON(text);
        } catch (e) {
          lastErr = new Error(`Bad JSON from ${model}: ${text.slice(0, 200)}`);
          continue;
        }
      }
      const body = await res.text();
      lastErr = new Error(`Gemini ${model} ${res.status}: ${body.slice(0, 300)}`);
      if (res.status === 404 || res.status === 400) break; // model unavailable -> next model
      if (res.status === 429 || res.status >= 500 || res.status === 0) {
        const retry = Number((body.match(/"retryDelay":\s*"(\d+)s"/) || [])[1] || 0);
        // A daily quota exhaustion will not clear with retries; move to the next model.
        if (/PerDay|per day/i.test(body)) break;
        await sleep(Math.max(retry * 1000, 4000 * (attempt + 1)));
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr;
}

function parseLooseJSON(text) {
  const t = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try {
    return JSON.parse(t);
  } catch {
    const start = t.search(/[[{]/);
    const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
    return JSON.parse(t.slice(start, end + 1));
  }
}
