import { handler } from '../lib/http.js';
import { dateTurn, DATE_TURNS } from '../lib/agents.js';

export default handler(async ({ self, other, venue, transcript = [], turn = 0 }) => {
  if (!self || !other) throw new Error('Need both agents');
  return dateTurn({ self, other, venue, transcript, turn, totalTurns: DATE_TURNS });
});
