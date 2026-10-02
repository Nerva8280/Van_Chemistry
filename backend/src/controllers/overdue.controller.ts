import { Request, Response } from "express";
import prisma from "../config/db";
import { toNumber } from "../utils/money";
import { computeOverdue, startOfDay } from "../services/overdue.service";
import { buildOverdueExportWorkbook, OverdueExportRow } from "../services/excel.service";
import { dueBeforeFilter, effectiveDueDate } from "../services/tuition.service";

function resolveYear(req: Request): number | undefined {
  const y = parseInt((req.query.year as string) ?? "", 10);
  return Number.isInteger(y) ? y : undefined;
}

export async function computeOverdueList(userId: string, year?: number): Promise<OverdueExportRow[]> {
  const now = new Date();
  const payments = await prisma.tuitionPayment.findMany({
    where: {
      isPaid: false,
      student: { class: { userId } },
      ...(year ? { period: { year } } : {}),
      ...dueBeforeFilter(startOfDay(now)),
    },
    include: { student: { include: { class: true } }, period: true },
  });
  payments.sort((a, b) => (effectiveDueDate(a)?.getTime() ?? 0) - (effectiveDueDate(b)?.getTime() ?? 0));

  const rows: OverdueExportRow[] = [];
  for (const p of payments) {
    const dueDate = effectiveDueDate(p);
    if (!dueDate) continue;
    const overdue = computeOverdue({ isPaid: false, dueDate, now });
    if (!overdue.isOverdue || !overdue.severity) continue;
    const expectedAmount = toNumber(p.expectedAmount);
    const paidAmount = toNumber(p.paidAmount);
    rows.push({
      paymentId: p.id,
      studentId: p.studentId,
      studentName: p.student.fullName,
      className: p.student.class.name,
      periodName: p.period.name,
      year: p.period.year,
      month: p.period.month,
      dueDate,
      daysLate: overdue.daysLate,
      expectedAmount,
      paidAmount,
      remaining: Math.max(expectedAmount - paidAmount, 0),
      severity: overdue.severity,
    });
  }
  return rows;
}

export async function getOverdueList(req: Request, res: Response) {
  res.json(await computeOverdueList(req.ownerId!, resolveYear(req)));
}

export default { getOverdueList, computeOverdueList };
