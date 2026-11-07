// Judge: 2D HP protein folding. The chain (H/P letters) is placed on the square lattice by absolute
// moves; it must not cross itself. Energy = -(number of H-H pairs adjacent on the grid but not
// consecutive in the chain). Score = energy (lower is better). Integers only: exact.
// Input: { "moves": "RRULD..." } with exactly n-1 letters among R, L, U, D.

const STEP = { R: [1, 0], L: [-1, 0], U: [0, 1], D: [0, -1] };

/** The lattice positions of a fold, or throws. */
export function place(sequence, moves) {
  if (typeof moves !== 'string') throw new Error('"moves" must be a string of R, L, U, D');
  const m = moves.trim().toUpperCase();
  if (m.length !== sequence.length - 1) throw new Error(`expected ${sequence.length - 1} moves, got ${m.length}`);
  const pos = [[0, 0]];
  const seen = new Map([['0,0', 0]]);
  for (let i = 0; i < m.length; i++) {
    const d = STEP[m[i]];
    if (!d) throw new Error(`move ${i + 1}: "${m[i]}" is not R, L, U or D`);
    const [x, y] = pos[pos.length - 1];
    const p = [x + d[0], y + d[1]];
    const k = `${p[0]},${p[1]}`;
    if (seen.has(k)) throw new Error(`the chain crosses itself at residue ${i + 2} (cell ${k} already holds residue ${seen.get(k) + 1})`);
    seen.set(k, i + 1);
    pos.push(p);
  }
  return { pos, seen };
}

/** H-H contacts: pairs of H on adjacent cells, not consecutive in the chain. */
export function contacts(sequence, pos, seen) {
  const out = [];
  for (let i = 0; i < pos.length; i++) {
    if (sequence[i] !== 'H') continue;
    const [x, y] = pos[i];
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const j = seen.get(`${x + dx},${y + dy}`);
      if (j !== undefined && sequence[j] === 'H' && Math.abs(i - j) > 1) out.push([i, j]);
    }
  }
  return out;
}

export function judge(cas, solution) {
  const { pos, seen } = place(cas.sequence, solution?.moves);
  return { score: String(-contacts(cas.sequence, pos, seen).length) };
}
