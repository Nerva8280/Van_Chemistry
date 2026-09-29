import { Request, Response } from "express";
import prisma from "../config/db";
import { toNumber } from "../utils/money";
import { startOfDay } from "../services/overdue.service";
import { isOverdue, paymentStatus, PaymentStatus } from "../services/tuition.service";

function parseIntParam(value: unknown): number | undefined {
  const n = parseInt(String(value ?? ""), 10);
  return Number.isInteger(n) ? n : undefined;
}

export async function getDashboard(req: Request, res: Response) {
  const userId = req.ownerId!;
  const classId = (req.query.classId as string) || undefined;
  const sheet = (req.query.sheet as string) || undefined;

  const classWhere: any = { userId };
  if (classId) classWhere.id = classId;
  if (sheet) classWhere.sheetName = sheet;

  const yearRows = await prisma.tuitionPeriod.findMany({
    where: { class: classWhere },
    distinct: ["year"],
    select: { year: true },
    orderBy: { year: "desc" },
  });
  const years = yearRows.map((r) => r.year);
  const year = parseIntParam(req.query.year) ?? years[0] ?? new Date().getFullYear();

  const [classes, payments] = await Promise.all([
    prisma.class.findMany({ where: classWhere, select: { id: true, name: true } }),
    prisma.tuitionPayment.findMany({
      where: { student: { class: classWhere }, period: { year } },
      include: { period: true, student: { select: { id: true, fullName: true, classId: true } } },
    }),
  ]);
  const classNames = new Map(classes.map((c) => [c.id, c.name]));

  const now = new Date();
  const today = startOfDay(now);

  const items = payments.map((p) => {
    const expected = toNumber(p.expectedAmount);
    const paid = toNumber(p.paidAmount);
    return {
      p,
      expected,
      paid,
      status: paymentStatus({ isPaid: p.isPaid, paidAmount: paid, dueDate: p.period.dueDate }, now),
    };
  });

  // Months that exist in the data; default selection is the latest one that has already started.
  const monthSet = new Map<number, string>();
  for (const { p } of items) if (!monthSet.has(p.period.month)) monthSet.set(p.period.month, p.period.name);
  const months = [...monthSet.keys()].sort((a, b) => a - b);
  const started = items
    .filter(({ p }) => {
      const first = p.period.startDate ?? p.period.endDate ?? p.period.dueDate;
      return first !== null && startOfDay(first) <= today;
    })
    .map(({ p }) => p.period.month);
  const requestedMonth = parseIntParam(req.query.month);
  const selectedMonth =
    requestedMonth && months.includes(requestedMonth)
      ? requestedMonth
      : started.length
        ? Math.max(...started)
        : months[months.length - 1] ?? null;

  const scoped = requestedMonth ? items.filter(({ p }) => p.period.month === requestedMonth) : items;

  let totalExpected = 0;
  let totalCollected = 0;
  const studentIds = new Set<string>();
  const overdueStudentIds = new Set<string>();
  for (const it of scoped) {
    totalExpected += it.expected;
    totalCollected += it.paid;
    studentIds.add(it.p.studentId);
    if (!it.p.isPaid && isOverdue(it.p.period.dueDate, now)) {
      overdueStudentIds.add(it.p.studentId);
    }
  }
  const totalOutstanding = scoped.reduce((s, it) => s + (it.p.isPaid ? 0 : Math.max(it.expected - it.paid, 0)), 0);

  const monthItems = selectedMonth ? items.filter(({ p }) => p.period.month === selectedMonth) : [];
  const monthStats: Record<PaymentStatus, number> = { paid: 0, partial: 0, overdue: 0, unpaid: 0 };
  for (const it of monthItems) monthStats[it.status] += 1;

  const byMonth = months.map((m) => {
    const inMonth = items.filter(({ p }) => p.period.month === m);
    return {
      month: m,
      label: `Tháng ${m}`,
      expected: inMonth.reduce((s, it) => s + it.expected, 0),
      collected: inMonth.reduce((s, it) => s + it.paid, 0),
    };
  });

  const perClass = new Map<string, { expected: number; collected: number }>();
  for (const it of scoped) {
    const e = perClass.get(it.p.student.classId) ?? { expected: 0, collected: 0 };
    e.expected += it.expected;
    e.collected += it.paid;
    perClass.set(it.p.student.classId, e);
  }
  const byClass = classes
    .filter((c) => perClass.has(c.id))
    .map((c) => {
      const e = perClass.get(c.id)!;
      return { className: c.name, expected: e.expected, collected: e.collected, rate: e.expected ? e.collected / e.expected : 0 };
    });

  const unpaidList = monthItems
    .filter((it) => it.status !== "paid")
    .map((it) => ({
      paymentId: it.p.id,
      studentId: it.p.studentId,
      studentName: it.p.student.fullName,
      className: classNames.get(it.p.student.classId) ?? "",
      periodName: it.p.period.name,
      month: it.p.period.month,
      dueDate: it.p.period.dueDate,
      expectedAmount: it.expected,
      paidAmount: it.paid,
      remaining: Math.max(it.expected - it.paid, 0),
      status: it.status,
    }))
    .sort((a, b) => a.className.localeCompare(b.className, "vi") || a.studentName.localeCompare(b.studentName, "vi"));

  const totalStudents = studentIds.size;
  res.json({
    year,
    years: years.length ? years : [year],
    months,
    selectedMonth,
    summary: {
      totalClasses: classes.length,
      totalStudents,
      totalExpected,
      totalCollected,
      totalOutstanding,
      completionRate: totalExpected > 0 ? Math.min(totalCollected / totalExpected, 1) : 0,
      averageFeePerStudent: totalStudents > 0 ? Math.round(totalExpected / totalStudents) : 0,
      overdueStudentCount: overdueStudentIds.size,
    },
    monthStats,
    byMonth,
    byClass,
    unpaidList,
  });
}

export default { getDashboard };
