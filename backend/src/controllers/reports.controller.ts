import { Request, Response } from "express";
import prisma from "../config/db";
import { toNumber } from "../utils/money";
import {
  buildStudentsExportWorkbook,
  buildTuitionSummaryExportWorkbook,
  buildOverdueExportWorkbook,
} from "../services/excel.service";
import { computeOverdueList } from "./overdue.controller";

function resolveYear(req: Request): number {
  const y = parseInt((req.query.year as string) ?? "", 10);
  return Number.isInteger(y) ? y : new Date().getFullYear();
}

function sendXlsx(res: Response, buffer: Buffer, filename: string) {
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
}

export async function exportStudentsReport(req: Request, res: Response) {
  const userId = req.user!.id;

  const students = await prisma.student.findMany({
    where: { class: { userId } },
    include: { class: true },
    orderBy: { fullName: "asc" },
  });

  const buffer = buildStudentsExportWorkbook(
    students.map((s) => ({
      fullName: s.fullName,
      className: s.class.name,
      parentEmail: s.parentEmail,
      parentPhone: s.parentPhone,
      monthlyTuitionFee: toNumber(s.monthlyTuitionFee),
      active: s.active,
    }))
  );

  sendXlsx(res, buffer, "danh-sach-hoc-sinh.xlsx");
}

export async function exportTuitionSummaryReport(req: Request, res: Response) {
  const userId = req.user!.id;
  const year = resolveYear(req);

  const students = await prisma.student.findMany({
    where: { class: { userId } },
    include: { class: true, payments: { where: { year } } },
    orderBy: { fullName: "asc" },
  });

  const buffer = buildTuitionSummaryExportWorkbook(
    year,
    students.map((s) => ({
      fullName: s.fullName,
      className: s.class.name,
      monthlyTuitionFee: toNumber(s.monthlyTuitionFee),
      payments: s.payments.map((p) => ({
        month: p.month,
        isPaid: p.isPaid,
        amount: toNumber(p.amount),
      })),
    }))
  );

  sendXlsx(res, buffer, `tong-hop-hoc-phi-${year}.xlsx`);
}

export async function exportOverdueReport(req: Request, res: Response) {
  const userId = req.user!.id;
  const year = resolveYear(req);

  const rows = await computeOverdueList(userId, year);
  const buffer = buildOverdueExportWorkbook(rows);

  sendXlsx(res, buffer, `danh-sach-qua-han-${year}.xlsx`);
}

export default { exportStudentsReport, exportTuitionSummaryReport, exportOverdueReport };
