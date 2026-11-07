// Judge: n equal circles in the unit square [0,1] x [0,1]. Score = the common radius (higher is better).
// Input: { "centers": [["x", "y"], ...] } with exactly n centres, decimals with at most 30 digits.
// The radius is computed, not declared: the largest radius these centres allow, rounded down.

import { fromUnits } from '../../lib/exact.mjs';
import { minSquaredDistance, pairRadius, readCenters, squareWall } from '../../lib/circles.mjs';

export function judge(cas, solution) {
  const pts = readCenters(solution, cas.n);
  const wall = squareWall(pts);
  if (wall <= 0n) throw new Error('a center lies on or outside the square [0,1] x [0,1]');
  const pair = cas.n > 1 ? pairRadius(minSquaredDistance(pts)) : wall;
  const r = pair < wall ? pair : wall;
  if (r <= 0n) throw new Error('the circles would have no room at all');
  return { score: fromUnits(r) };
}
