import { Request, Response } from "express";
import prisma from "../config/db";
import { toNumber } from "../utils/money";
import { computeOverdue } from "../services/overdue.service";

function resolveYear(req: Request): number {
  const y = parseInt((req.query.year as string) ?? "", 10);
  return Number.isInteger(y) ? y : new Date().getFullYear();
}

export async function getSummary(req: Request, res: Response) {
  const userId = req.user!.id;
  const year = resolveYear(req);

  const [totalClasses, totalStudents, payments] = await Promise.all([
    prisma.class.count({ where: { userId } }),
    prisma.student.count({ where: { class: { userId } } }),
    prisma.tuitionPayment.findMany({
      where: { year, student: { class: { userId } } },
      select: { amount: true, isPaid: true, dueDate: true, studentId: true },
    }),
  ]);

  let totalExpected = 0;
  let totalCollected = 0;
  const overdueStudentIds = new Set<string>();

  for (const p of payments) {
    const amount = toNumber(p.amount);
    totalExpected += amount;
    if (p.isPaid) {
      totalCollected += amount;
    } else {
      const overdue = computeOverdue({ isPaid: p.isPaid, dueDate: p.dueDate });
      if (overdue.isOverdue) overdueStudentIds.add(p.studentId);
    }
  }

  const totalOutstanding = totalExpected - totalCollected;
  const completionRate = totalExpected > 0 ? totalCollected / totalExpected : 0;

  res.json({
    totalClasses,
    totalStudents,
    totalExpected,
    totalCollected,
    totalOutstanding,
    completionRate,
    overdueStudentCount: overdueStudentIds.size,
  });
}

export async function getCharts(req: Request, res: Response) {
  const userId = req.user!.id;
  const year = resolveYear(req);

  const classes = await prisma.class.findMany({ where: { userId }, select: { id: true, name: true } });

  const payments = await prisma.tuitionPayment.findMany({
    where: { year, student: { class: { userId } } },
    select: {
      month: true,
      amount: true,
      isPaid: true,
      student: { select: { classId: true } },
    },
  });

  // monthlyRevenue + revenueTrend
  const monthlyRevenue = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    expected: 0,
    collected: 0,
  }));

  for (const p of payments) {
    const bucket = monthlyRevenue[p.month - 1];
    if (!bucket) continue;
    const amount = toNumber(p.amount);
    bucket.expected += amount;
    if (p.isPaid) bucket.collected += amount;
  }

  const revenueTrend = monthlyRevenue.map((m) => ({ month: m.month, revenue: m.collected }));

  // classCollectionRate
  const perClassTotals = new Map<string, { expected: number; collected: number }>();
  for (const cls of classes) perClassTotals.set(cls.id, { expected: 0, collected: 0 });

  for (const p of payments) {
    const classId = p.student.classId;
    const entry = perClassTotals.get(classId);
    if (!entry) continue;
    const amount = toNumber(p.amount);
    entry.expected += amount;
    if (p.isPaid) entry.collected += amount;
  }

  const classCollectionRate = classes.map((cls) => {
    const entry = perClassTotals.get(cls.id)!;
    const rate = entry.expected > 0 ? entry.collected / entry.expected : 0;
    return { className: cls.name, rate };
  });

  // paidVsUnpaid (count of payment rows)
  let paid = 0;
  let unpaid = 0;
  for (const p of payments) {
    if (p.isPaid) paid += 1;
    else unpaid += 1;
  }

  res.json({
    monthlyRevenue,
    classCollectionRate,
    paidVsUnpaid: { paid, unpaid },
    revenueTrend,
  });
}

export default { getSummary, getCharts };
