// Judge: n equal circles inside the unit disc (radius 1, centred at the origin).
// Score = the common radius (higher is better).
// Input: { "centers": [["x", "y"], ...] } with exactly n centres, decimals with at most 30 digits.
// The radius is computed, not declared: the largest radius these centres allow, rounded down.

import { fromUnits } from '../../lib/exact.mjs';
import { discWall, minSquaredDistance, pairRadius, readCenters } from '../../lib/circles.mjs';

export function judge(cas, solution) {
  const pts = readCenters(solution, cas.n);
  const wall = discWall(pts);
  if (wall <= 0n) throw new Error('a center lies on or outside the unit circle');
  const pair = cas.n > 1 ? pairRadius(minSquaredDistance(pts)) : wall;
  const r = pair < wall ? pair : wall;
  if (r <= 0n) throw new Error('the circles would have no room at all');
  return { score: fromUnits(r) };
}
