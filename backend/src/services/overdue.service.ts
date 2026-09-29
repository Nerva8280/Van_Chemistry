import env from "../config/env";

/**
 * Builds the due date for a given (year, month) using TUITION_DUE_DAY
 * (default day 5 of that month), at local midnight.
 */
export function buildDueDate(year: number, month: number, dueDay: number = env.TUITION_DUE_DAY): Date {
  // month is 1-12; JS Date month is 0-11.
  return new Date(year, month - 1, dueDay, 0, 0, 0, 0);
}

export type Severity = "orange" | "red";

export interface OverdueComputationInput {
  isPaid: boolean;
  dueDate: Date;
  now?: Date;
}

export interface OverdueComputationResult {
  isOverdue: boolean;
  daysLate: number;
  severity: Severity | null;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/**
 * Pure function: computes whether a payment is overdue, how many days late,
 * and its severity, per the contract:
 *   daysLate = today - dueDate (days), only if unpaid and dueDate < today
 *   severity: "orange" if daysLate <= 15, else "red"
 */
export function computeOverdue(input: OverdueComputationInput): OverdueComputationResult {
  const { isPaid, dueDate } = input;
  const now = startOfDay(input.now ?? new Date());
  const due = startOfDay(dueDate);

  if (isPaid || due >= now) {
    return { isOverdue: false, daysLate: 0, severity: null };
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysLate = Math.round((now.getTime() - due.getTime()) / msPerDay);

  const severity: Severity = daysLate <= 15 ? "orange" : "red";

  return { isOverdue: true, daysLate, severity };
}

/** Returns true if `date` is exactly `daysAgo` days before `today` (by calendar day). */
export function isExactDaysAgo(date: Date, today: Date, daysAgo: number): boolean {
  const d = startOfDay(date);
  const t = startOfDay(today);
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = Math.round((t.getTime() - d.getTime()) / msPerDay);
  return diff === daysAgo;
}

export default {
  buildDueDate,
  computeOverdue,
  isExactDaysAgo,
};
