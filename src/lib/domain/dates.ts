/**
 * Calendar-date helpers on ISO `YYYY-MM-DD` strings. All arithmetic is done in
 * UTC so results never depend on the machine's time zone or DST.
 */

export interface Ymd {
  y: number;
  m: number; // 1-12
  d: number;
}

export function parseIso(iso: string): Ymd {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`invalid date "${iso}"`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function toIso(y: number, m: number, d: number): string {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

/** Date in (y, m) with the day clamped to the month's length (e.g. Feb 30 → Feb 28/29). */
export function clampedDate(y: number, m: number, d: number): string {
  return toIso(y, m, Math.min(d, daysInMonth(y, m)));
}

function toUtcMs(iso: string): number {
  const { y, m, d } = parseIso(iso);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): string {
  const dt = new Date(ms);
  return toIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(iso: string, n: number): string {
  return fromUtcMs(toUtcMs(iso) + n * 86_400_000);
}

/** Calendar-month addition, clamping the day (Jan 31 + 1 month → Feb 28/29). */
export function addMonths(iso: string, n: number): string {
  const { y, m, d } = parseIso(iso);
  const total = y * 12 + (m - 1) + n;
  return clampedDate(Math.floor(total / 12), (total % 12) + 1, d);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function diffDays(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / 86_400_000);
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function addMonthKey(key: string, n: number): string {
  return monthKey(addMonths(`${key}-01`, n));
}

export function quarterOf(iso: string): string {
  const { y, m } = parseIso(iso);
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
}

export function quarterBounds(key: string): { start: string; end: string } {
  const [ys, qs] = key.split("-Q");
  const y = Number(ys);
  const q = Number(qs);
  const sm = (q - 1) * 3 + 1;
  return { start: toIso(y, sm, 1), end: toIso(y, sm + 2, daysInMonth(y, sm + 2)) };
}

export function nextQuarter(key: string): string {
  const [ys, qs] = key.split("-Q");
  const q = Number(qs);
  return q === 4 ? `${Number(ys) + 1}-Q1` : `${ys}-Q${q + 1}`;
}

/** The anniversary of (month, day) that falls in `year`, clamped for short months. */
export function anniversaryInYear(month: number, day: number, year: number): string {
  return clampedDate(year, month, day);
}

/** Most recent anniversary of (month, day) on or before `today`. */
export function lastAnniversary(month: number, day: number, today: string): string {
  const { y } = parseIso(today);
  const thisYear = anniversaryInYear(month, day, y);
  return thisYear <= today ? thisYear : anniversaryInYear(month, day, y - 1);
}

/** Next anniversary of (month, day) on or after `today`. */
export function nextAnniversary(month: number, day: number, today: string): string {
  const { y } = parseIso(today);
  const thisYear = anniversaryInYear(month, day, y);
  return thisYear >= today ? thisYear : anniversaryInYear(month, day, y + 1);
}

/** Today's date in the local time zone of the runtime. */
export function localToday(now: Date = new Date()): string {
  return toIso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const { y, m, d } = parseIso(iso);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[m - 1]} ${d}, ${y}`;
}

const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** Wallet-style short date: `31 OCT`, with the year when it isn't `today`'s year (`15 JAN 2027`). */
export function shortDate(iso: string | null | undefined, today?: string): string {
  if (!iso) return "—";
  const { y, m, d } = parseIso(iso);
  const sameYear = today !== undefined && parseIso(today).y === y;
  return `${d} ${MON[m - 1]}${sameYear ? "" : ` ${y}`}`;
}

/** Day of week + short date: `SAT 17 OCT`. */
export function dayDate(iso: string, today?: string): string {
  const { y, m, d } = parseIso(iso);
  return `${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${shortDate(iso, today)}`;
}

/** A period's months: `OCT`, `JUL–DEC`, with the year when it isn't `today`'s (`JAN–JUN 2027`, `JUN 2026–JUN 2027`). */
export function periodRange(start: string, end: string, today?: string): string {
  const a = parseIso(start);
  const b = parseIso(end);
  if (a.y !== b.y) return `${MON[a.m - 1]} ${a.y}–${MON[b.m - 1]} ${b.y}`;
  const year = today !== undefined && parseIso(today).y === a.y ? "" : ` ${a.y}`;
  return a.m === b.m ? `${MON[a.m - 1]}${year}` : `${MON[a.m - 1]}–${MON[b.m - 1]}${year}`;
}
