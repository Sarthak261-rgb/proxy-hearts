import { handler } from '../lib/http.js';
import { swipe, reviewNewcomer } from '../lib/agents.js';

// The newcomer's agent swipes on the pool, and the pool's agents review the newcomer, in parallel.
export default handler(async ({ me, pool }) => {
  if (!me || !Array.isArray(pool) || !pool.length) throw new Error('Need a profile and a pool');
  const [mine, theirs] = await Promise.all([swipe(me, pool), reviewNewcomer(me, pool)]);
  return { mine, theirs };
});
