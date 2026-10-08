/**
 * When an Autopilot runs. A schedule is a set of weekdays and times of day in the brand's time zone,
 * for example every Monday and Thursday at 09:00. Pure and shared by the server, the screens and the tests.
 *
 * Days are ISO weekdays: 1 = Monday ... 7 = Sunday. Times are "HH:MM" on the 24-hour clock.
 * Everything stored and compared is a UTC instant; the zone is only used to read and write wall-clock times.
 */

export interface Schedule {
  days: number[];
  times: string[];
}

export const WEEKDAYS = [
  { n: 1, short: "Mon", long: "Monday" },
  { n: 2, short: "Tue", long: "Tuesday" },
  { n: 3, short: "Wed", long: "Wednesday" },
  { n: 4, short: "Thu", long: "Thursday" },
  { n: 5, short: "Fri", long: "Friday" },
  { n: 6, short: "Sat", long: "Saturday" },
  { n: 7, short: "Sun", long: "Sunday" },
] as const;

export const MAX_TIMES_PER_DAY = 4;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Why a schedule is not allowed, or null when it is fine. */
export function scheduleProblem(s: unknown): string | null {
  const x = s as Partial<Schedule> | null;
  if (!x || !Array.isArray(x.days) || !Array.isArray(x.times)) return "Choose the days and times.";
  if (x.days.length === 0) return "Choose at least one day.";
  if (x.days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) return "Days must be Monday to Sunday.";
  if (new Set(x.days).size !== x.days.length) return "Each day can be chosen once.";
  if (x.times.length === 0) return "Choose at least one time.";
  if (x.times.length > MAX_TIMES_PER_DAY) return `Choose at most ${MAX_TIMES_PER_DAY} times a day.`;
  if (x.times.some((t) => typeof t !== "string" || !TIME.test(t))) return "Times look like 09:00.";
  if (new Set(x.times).size !== x.times.length) return "Each time can be chosen once.";
  return null;
}

/** The same schedule with days and times in order. */
export function normaliseSchedule(s: Schedule): Schedule {
  return { days: [...s.days].sort((a, b) => a - b), times: [...s.times].sort() };
}

/** Wall-clock parts of an instant in a zone. */
function partsIn(date: Date, timeZone: string): { y: number; m: number; d: number; h: number; min: number } {
  const f = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" });
  const get = (t: string) => Number(f.formatToParts(date).find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute") };
}

/** How far the zone is ahead of UTC at an instant, in milliseconds. */
function offsetMs(date: Date, timeZone: string): number {
  const p = partsIn(date, timeZone);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - Math.floor(date.getTime() / 60_000) * 60_000;
}

/** The UTC instant at which the wall clock in `timeZone` reads y-m-d h:min. */
function zonedToUtc(y: number, m: number, d: number, h: number, min: number, timeZone: string): Date {
  const naive = Date.UTC(y, m - 1, d, h, min);
  const first = naive - offsetMs(new Date(naive), timeZone);
  const second = naive - offsetMs(new Date(first), timeZone);
  return new Date(second);
}

/** ISO weekday (1..7) of a calendar date. */
function isoWeekday(y: number, m: number, d: number): number {
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
}

/** True when the zone name is one the runtime knows. */
export function validTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The first scheduled moment strictly after `from`, or null if the schedule is not valid. */
export function nextRunAt(s: Schedule, timeZone: string, from: Date): Date | null {
  if (scheduleProblem(s) || !validTimeZone(timeZone)) return null;
  const { y, m, d } = partsIn(from, timeZone);
  const times = [...s.times].sort();
  // Eight days ahead always contains every chosen weekday at least once.
  for (let add = 0; add <= 8; add++) {
    const day = new Date(Date.UTC(y, m - 1, d + add));
    const dy = day.getUTCFullYear();
    const dm = day.getUTCMonth() + 1;
    const dd = day.getUTCDate();
    if (!s.days.includes(isoWeekday(dy, dm, dd))) continue;
    for (const t of times) {
      const [hh, mm] = t.split(":").map(Number) as [number, number];
      const at = zonedToUtc(dy, dm, dd, hh, mm, timeZone);
      if (at.getTime() > from.getTime()) return at;
    }
  }
  return null;
}

/** The next `count` scheduled moments after `from`. */
export function upcoming(s: Schedule, timeZone: string, from: Date, count: number): Date[] {
  const out: Date[] = [];
  let cursor = from;
  while (out.length < count) {
    const next = nextRunAt(s, timeZone, cursor);
    if (!next) break;
    out.push(next);
    cursor = next;
  }
  return out;
}

/** "Every Monday and Thursday at 09:00", for people. */
export function describeSchedule(s: Schedule): string {
  if (scheduleProblem(s)) return "No schedule yet";
  const days = [...s.days].sort((a, b) => a - b);
  const names = days.length === 7 ? "day" : days.length === 5 && days.join() === "1,2,3,4,5" ? "weekday" : null;
  const list = days.map((n) => WEEKDAYS[n - 1]!.long);
  const when = names ? `Every ${names}` : `Every ${list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}` : list[0]}`;
  const t = [...s.times].sort();
  return `${when} at ${t.length > 1 ? `${t.slice(0, -1).join(", ")} and ${t[t.length - 1]}` : t[0]}`;
}
