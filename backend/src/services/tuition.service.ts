import { Prisma, PrismaClient } from "@prisma/client";
import prisma from "../config/db";
import { buildDueDate } from "./overdue.service";

/**
 * Creates the 12 monthly TuitionPayment rows (Jan..Dec) for a new student,
 * for the given year (defaults to current year), all unpaid.
 * Uses `createMany` with `skipDuplicates` so it is safe to call more than
 * once (e.g. re-run after partial failure) without violating the
 * @@unique([studentId, year, month]) constraint.
 */
export async function createYearlyPaymentsForStudent(
  client: Prisma.TransactionClient | PrismaClient,
  params: { studentId: string; monthlyTuitionFee: Prisma.Decimal | number | string; year?: number }
) {
  const year = params.year ?? new Date().getFullYear();
  const amount = params.monthlyTuitionFee;

  const rows = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    return {
      studentId: params.studentId,
      year,
      month,
      isPaid: false,
      paidDate: null,
      amount: amount as any,
      dueDate: buildDueDate(year, month),
    };
  });

  await client.tuitionPayment.createMany({ data: rows, skipDuplicates: true });
}

/**
 * Toggles the paid state of a TuitionPayment row (creating it if missing),
 * date-stamping paidDate when flipping to true and clearing it when flipping
 * to false, per the contract.
 */
export async function setPaymentStatus(params: {
  studentId: string;
  year: number;
  month: number;
  isPaid: boolean;
}) {
  const { studentId, year, month, isPaid } = params;

  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) {
    throw Object.assign(new Error("Không tìm thấy học sinh."), { status: 404 });
  }

  const existing = await prisma.tuitionPayment.findUnique({
    where: { studentId_year_month: { studentId, year, month } },
  });

  const dueDate = buildDueDate(year, month);

  if (!existing) {
    return prisma.tuitionPayment.create({
      data: {
        studentId,
        year,
        month,
        isPaid,
        paidDate: isPaid ? new Date() : null,
        amount: student.monthlyTuitionFee,
        dueDate,
      },
    });
  }

  return prisma.tuitionPayment.update({
    where: { id: existing.id },
    data: {
      isPaid,
      paidDate: isPaid ? new Date() : null,
    },
  });
}

export default { createYearlyPaymentsForStudent, setPaymentStatus };
