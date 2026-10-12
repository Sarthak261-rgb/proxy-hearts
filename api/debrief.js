import { handler } from '../lib/http.js';
import { debrief } from '../lib/agents.js';

export default handler(async ({ self, other, venue, transcript }) => {
  if (!self || !other || !transcript?.length) throw new Error('Need both agents and a transcript');
  return debrief({ self, other, venue, transcript });
});
