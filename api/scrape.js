import { handler } from '../lib/http.js';
import { scrapePerson, normalizeLinkedIn, normalizeInstagram } from '../lib/scrape.js';

export default handler(async ({ linkedin, instagram }) => {
  if (!normalizeLinkedIn(linkedin || '')) throw new Error('Please paste a LinkedIn profile link (linkedin.com/in/...)');
  if (!normalizeInstagram(instagram || '')) throw new Error('Please paste an Instagram profile link (instagram.com/...)');
  const s = await scrapePerson({ linkedin, instagram });
  if (s.linkedin.error && s.instagram.error) throw new Error(`Could not read either profile. LinkedIn: ${s.linkedin.error}. Instagram: ${s.instagram.error}`);
  if (s.instagram.private) throw new Error('That Instagram account is private. Only public profiles can be read.');
  return s;
});
