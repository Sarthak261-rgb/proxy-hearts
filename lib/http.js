// Tiny helpers so the same handlers run on Vercel and on the local Node server.
export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export function handler(fn) {
  return async (req, res) => {
    try {
      if (req.method !== 'POST' && req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
      const body = req.method === 'POST' ? await readBody(req) : {};
      const out = await fn(body, req, res);
      if (out !== undefined) json(res, 200, out);
    } catch (e) {
      console.error(e);
      json(res, 500, { error: e.message });
    }
  };
}
