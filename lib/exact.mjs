// Exact decimal arithmetic for judges. No floating point decides a score: every coordinate is read as
// a decimal with at most 30 digits after the point and turned into an integer count of 10^-30 units.
// Runs unchanged in Node and in the browser.

export const DIGITS = 30;
export const S = 10n ** BigInt(DIGITS);

const DEC = /^-?\d+(\.\d+)?$/;

/** A JSON number or decimal string -> BigInt count of 10^-30 units. Throws on anything else. */
export function toUnits(v, what = 'value') {
  let s;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`${what}: not a finite number`);
    s = String(v);
    if (/e/i.test(s)) s = v.toFixed(DIGITS);
  } else if (typeof v === 'string') s = v.trim();
  else throw new Error(`${what}: expected a number or a decimal string`);
  if (!DEC.test(s)) throw new Error(`${what}: "${String(v).slice(0, 40)}" is not a plain decimal`);
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  const [ip, fp = ''] = s.split('.');
  if (fp.length > DIGITS) throw new Error(`${what}: at most ${DIGITS} digits after the point`);
  const u = BigInt(ip) * S + BigInt((fp + '0'.repeat(DIGITS)).slice(0, DIGITS));
  return neg ? -u : u;
}

/** BigInt units -> decimal string with all 30 digits. */
export function fromUnits(u) {
  const neg = u < 0n;
  if (neg) u = -u;
  const ip = u / S;
  const fp = (u % S).toString().padStart(DIGITS, '0');
  return `${neg ? '-' : ''}${ip}.${fp}`;
}

/** floor(sqrt(n)) for n >= 0. */
export function isqrt(n) {
  if (n < 0n) throw new Error('isqrt of a negative number');
  if (n < 2n) return n;
  // Newton from a float guess pushed above the root, so the iteration only goes down.
  let x = BigInt(Math.ceil(Math.sqrt(Number(n)) * (1 + 1e-12))) + 1n;
  while (x * x < n) x *= 2n;
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) break;
    x = y;
  }
  while (x * x > n) x--;
  while ((x + 1n) * (x + 1n) <= n) x++;
  return x;
}

/** ceil(sqrt(n)) for n >= 0. */
export function csqrt(n) {
  const r = isqrt(n);
  return r * r === n ? r : r + 1n;
}

/** Compare two scores (decimal strings or integers). Returns -1, 0 or 1. */
export function compareScores(a, b) {
  const x = toUnits(String(a));
  const y = toUnits(String(b));
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Is score `a` better than `b` for a problem with direction `sens` ('max' or 'min')? */
export function better(a, b, sens = 'max') {
  if (b === undefined || b === null) return true;
  const c = compareScores(a, b);
  return sens === 'max' ? c > 0 : c < 0;
}

/** A short human form of a score: 15 significant decimals for reals, the integer otherwise. */
export function shortScore(s) {
  s = String(s);
  if (!s.includes('.')) return s;
  const [i, f] = s.split('.');
  const t = f.slice(0, 15).replace(/0+$/, '');
  return t ? `${i}.${t}` : i;
}
