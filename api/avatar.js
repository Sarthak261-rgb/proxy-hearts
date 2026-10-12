// Proxies profile pictures from the Instagram/LinkedIn CDNs (they block hotlinking from other origins).
const ALLOWED = /(^|\.)(cdninstagram\.com|fbcdn\.net|licdn\.com)$/;

export default async function avatar(req, res) {
  try {
    const url = new URL(req.url, 'http://x').searchParams.get('url');
    const target = new URL(url);
    if (target.protocol !== 'https:' || !ALLOWED.test(target.hostname)) {
      res.statusCode = 400;
      return res.end('host not allowed');
    }
    const r = await fetch(target, { signal: AbortSignal.timeout(10000) });
    res.statusCode = r.status;
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch {
    res.statusCode = 502;
    res.end('error');
  }
}
