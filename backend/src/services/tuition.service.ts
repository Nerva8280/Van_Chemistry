import { Prisma, PrismaClient, TuitionPayment, TuitionPeriod } from "@prisma/client";
import { toNumber } from "../utils/money";
import { computeOverdue, startOfDay } from "./overdue.service";

type Db = Prisma.TransactionClient | PrismaClient;

export type PaymentStatus = "paid" | "partial" | "overdue" | "unpaid";

export const STATUS_LABELS: Record<PaymentStatus, string> = {
  paid: "Đã đóng",
  partial: "Đóng một phần",
  overdue: "Quá hạn",
  unpaid: "Chưa đóng",
};

export function isOverdue(dueDate: Date | null, now: Date = new Date()): boolean {
  return dueDate !== null && computeOverdue({ isPaid: false, dueDate, now }).isOverdue;
}

export function paymentStatus(
  p: { isPaid: boolean; paidAmount: number; dueDate: Date | null },
  now: Date = new Date()
): PaymentStatus {
  if (p.isPaid) return "paid";
  if (p.paidAmount > 0) return "partial";
  if (isOverdue(p.dueDate, now)) return "overdue";
  return "unpaid";
}

export function serializePeriod(period: TuitionPeriod) {
  return {
    id: period.id,
    classId: period.classId,
    name: period.name,
    year: period.year,
    month: period.month,
    startDate: period.startDate,
    endDate: period.endDate,
    dueDate: period.dueDate,
  };
}

export function serializePayment(p: TuitionPayment & { period: TuitionPeriod }, now: Date = new Date()) {
  const expectedAmount = toNumber(p.expectedAmount);
  const paidAmount = toNumber(p.paidAmount);
  return {
    id: p.id,
    studentId: p.studentId,
    periodId: p.periodId,
    year: p.period.year,
    month: p.period.month,
    expectedAmount,
    paidAmount,
    isPaid: p.isPaid,
    paidDate: p.paidDate,
    note: p.note,
    status: paymentStatus({ isPaid: p.isPaid, paidAmount, dueDate: p.period.dueDate }, now),
    updatedAt: p.updatedAt,
  };
}

// A student who joins mid-year only owes the current and future periods of the class.
export async function createPaymentsForNewStudent(
  db: Db,
  params: { studentId: string; classId: string; fee: number }
) {
  const today = startOfDay(new Date());
  const periods = await db.tuitionPeriod.findMany({ where: { classId: params.classId } });
  const open = periods.filter((p) => {
    const last = p.endDate ?? p.dueDate ?? p.startDate;
    return last === null || startOfDay(last) >= today;
  });
  if (open.length === 0) return;
  await db.tuitionPayment.createMany({
    data: open.map((p) => ({ studentId: params.studentId, periodId: p.id, expectedAmount: params.fee })),
    skipDuplicates: true,
  });
}

export async function createPaymentsForNewPeriod(
  db: Db,
  params: { periodId: string; classId: string; onlyStudentIds?: string[] }
) {
  const students = await db.student.findMany({
    where: {
      classId: params.classId,
      active: true,
      ...(params.onlyStudentIds ? { id: { in: params.onlyStudentIds } } : {}),
    },
  });
  if (students.length === 0) return;
  await db.tuitionPayment.createMany({
    data: students.map((s) => ({
      studentId: s.id,
      periodId: params.periodId,
      expectedAmount: s.monthlyTuitionFee,
    })),
    skipDuplicates: true,
  });
}

export interface PaymentUpdateInput {
  isPaid?: boolean;
  paidAmount?: number;
  paidDate?: Date | null;
  note?: string | null;
}

/**
 * Checking the box means "fully paid": paidAmount becomes the expected amount and paidDate
 * defaults to today. Unchecking clears both. Entering an amount directly derives isPaid
 * from whether it covers the expected amount, so partial payments stay unchecked.
 */
export function buildPaymentUpdate(
  existing: { expectedAmount: number; paidDate: Date | null },
  input: PaymentUpdateInput,
  now: Date = new Date()
): Prisma.TuitionPaymentUpdateInput {
  const data: Prisma.TuitionPaymentUpdateInput = {};
  if (input.note !== undefined) data.note = input.note;

  if (input.paidAmount !== undefined) {
    const paid = input.paidAmount;
    data.paidAmount = paid;
    data.isPaid = input.isPaid ?? paid >= existing.expectedAmount;
    data.paidDate = paid > 0 ? (input.paidDate !== undefined ? input.paidDate : existing.paidDate ?? now) : null;
    return data;
  }

  if (input.isPaid === true) {
    data.isPaid = true;
    data.paidAmount = existing.expectedAmount;
    data.paidDate = input.paidDate ?? existing.paidDate ?? now;
  } else if (input.isPaid === false) {
    data.isPaid = false;
    data.paidAmount = 0;
    data.paidDate = null;
  } else if (input.paidDate !== undefined) {
    data.paidDate = input.paidDate;
  }
  return data;
}

export default {
  paymentStatus,
  serializePeriod,
  serializePayment,
  createPaymentsForNewStudent,
  createPaymentsForNewPeriod,
  buildPaymentUpdate,
};
