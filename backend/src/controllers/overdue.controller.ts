import { Request, Response } from "express";
import prisma from "../config/db";
import { toNumber } from "../utils/money";
import { computeOverdue } from "../services/overdue.service";
import { buildOverdueExportWorkbook } from "../services/excel.service";

function resolveYear(req: Request): number {
  const y = parseInt((req.query.year as string) ?? "", 10);
  return Number.isInteger(y) ? y : new Date().getFullYear();
}

export async function computeOverdueList(userId: string, year: number) {
  const payments = await prisma.tuitionPayment.findMany({
    where: { year, isPaid: false, student: { class: { userId } } },
    include: { student: { include: { class: true } } },
    orderBy: [{ dueDate: "asc" }],
  });

  const rows: {
    studentName: string;
    className: string;
    month: number;
    daysLate: number;
    amount: number;
    severity: "orange" | "red";
  }[] = [];

  for (const p of payments) {
    const overdue = computeOverdue({ isPaid: p.isPaid, dueDate: p.dueDate });
    if (!overdue.isOverdue || !overdue.severity) continue;
    rows.push({
      studentName: p.student.fullName,
      className: p.student.class.name,
      month: p.month,
      daysLate: overdue.daysLate,
      amount: toNumber(p.amount),
      severity: overdue.severity,
    });
  }

  return rows;
}

export async function getOverdueList(req: Request, res: Response) {
  const userId = req.user!.id;
  const year = resolveYear(req);
  const rows = await computeOverdueList(userId, year);
  res.json(rows);
}

export async function exportOverdue(req: Request, res: Response) {
  const userId = req.user!.id;
  const year = resolveYear(req);
  const rows = await computeOverdueList(userId, year);
  const buffer = buildOverdueExportWorkbook(rows);

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", 'attachment; filename="danh-sach-qua-han.xlsx"');
  res.send(buffer);
}

export default { getOverdueList, exportOverdue, computeOverdueList };
