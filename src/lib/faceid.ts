// Face ID helpers: turn raw Hikvision events into daily attendance + statistics.

export type Site = "zavod" | "office";

export interface FaceEvent {
  id: string;
  site: Site | string;
  person_code: string;
  employee_id: string | null;
  direction: "in" | "out" | string;
  event_time: string;
  work_date: string;
}

export interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  crosses_midnight: boolean;
  grace_minutes: number;
}

export interface DayAttendance {
  date: string;
  firstIn: string | null;
  firstOut: string | null;
  hours: number;
  late: boolean;
  early: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hhmm = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fmtHours = (h: number) => {
  if (!h) return "0s 00d";
  const total = Math.round(h * 60);
  return `${Math.floor(total / 60)}s ${pad(total % 60)}d`;
};

/** Group events into one record per work date. Repeat punches never re-count time. */
export function buildDays(events: FaceEvent[], shift?: Shift | null): Map<string, DayAttendance> {
  const map = new Map<string, DayAttendance>();
  const sorted = [...events].sort((a, b) => a.event_time.localeCompare(b.event_time));
  for (const e of sorted) {
    const day = map.get(e.work_date) ?? { date: e.work_date, firstIn: null, firstOut: null, hours: 0, late: false, early: false };
    if (e.direction === "in" && !day.firstIn) day.firstIn = e.event_time;
    if (e.direction === "out" && !day.firstOut) day.firstOut = e.event_time;
    map.set(e.work_date, day);
  }
  for (const day of map.values()) {
    if (day.firstIn && day.firstOut) {
      const diff = (new Date(day.firstOut).getTime() - new Date(day.firstIn).getTime()) / 3600000;
      day.hours = Math.max(0, diff);
    }
    if (shift && day.firstIn) day.late = isLate(day.firstIn, shift);
    if (shift && day.firstOut) day.early = isEarly(day.firstOut, shift);
  }
  return map;
}

function shiftBoundary(ref: Date, time: string, addDay = false) {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(ref);
  d.setHours(h, m ?? 0, 0, 0);
  if (addDay) d.setDate(d.getDate() + 1);
  return d;
}

export function isLate(checkIn: string, shift: Shift): boolean {
  const d = new Date(checkIn);
  const start = shiftBoundary(d, shift.start_time);
  // For a night shift, a punch after midnight belongs to the previous evening's start.
  if (shift.crosses_midnight && d.getHours() < 12) start.setDate(start.getDate() - 1);
  return d.getTime() > start.getTime() + (shift.grace_minutes ?? 10) * 60000;
}

export function isEarly(checkOut: string, shift: Shift): boolean {
  const d = new Date(checkOut);
  const end = shiftBoundary(d, shift.end_time);
  if (shift.crosses_midnight && d.getHours() >= 12) end.setDate(end.getDate() + 1);
  return d.getTime() < end.getTime() - (shift.grace_minutes ?? 10) * 60000;
}

export function sumHours(days: DayAttendance[]): number {
  return days.reduce((s, d) => s + d.hours, 0);
}

export function daysInRange(map: Map<string, DayAttendance>, from: Date, to: Date): DayAttendance[] {
  const a = ymd(from), b = ymd(to);
  return [...map.values()].filter((d) => d.date >= a && d.date <= b);
}

export const startOfWeek = (d = new Date()) => {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7; // Monday-based
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x;
};
export const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);
export const startOfYear = (d = new Date()) => new Date(d.getFullYear(), 0, 1);

export const SITE_LABEL: Record<string, string> = { zavod: "Zavod", office: "Office" };
