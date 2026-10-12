import { handler } from '../lib/http.js';
import { analyzePerson } from '../lib/agents.js';

export default handler(async ({ scraped }) => {
  if (!scraped) throw new Error('Missing scraped sources');
  const profile = await analyzePerson(scraped);
  const handle = scraped.instagram?.username || scraped.linkedin?.url?.match(/in\/([^/]+)/)?.[1] || 'person';
  return { ...profile, id: `u-${handle.replace(/[^\w-]/g, '').toLowerCase()}` };
});
