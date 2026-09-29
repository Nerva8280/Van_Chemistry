import { Request, Response } from "express";
import prisma from "../config/db";
import { toNumber } from "../utils/money";
import { AppError } from "../middleware/errorHandler";
import {
  PaymentStatus,
  buildPaymentUpdate,
  serializePayment,
  serializePeriod,
} from "../services/tuition.service";

const STATUSES: PaymentStatus[] = ["paid", "partial", "overdue", "unpaid"];

function parseIntParam(value: unknown): number | undefined {
  const n = parseInt(String(value ?? ""), 10);
  return Number.isInteger(n) ? n : undefined;
}

export function parseMoney(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new AppError(`${field} không hợp lệ (phải là số nguyên không âm).`);
  }
  return n;
}

function parseDateInput(value: unknown, field: string): Date | null {
  if (value === null || value === "") return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) throw new AppError(`${field} không hợp lệ.`);
  return d;
}

/** Years that have at least one period, newest first; used to populate the year filter. */
async function listYears(userId: string): Promise<number[]> {
  const rows = await prisma.tuitionPeriod.findMany({
    where: { class: { userId } },
    distinct: ["year"],
    select: { year: true },
    orderBy: { year: "desc" },
  });
  return rows.map((r) => r.year);
}

export async function getTuitionGrid(req: Request, res: Response) {
  const userId = req.ownerId!;
  const years = await listYears(userId);
  const year = parseIntParam(req.query.year) ?? years[0] ?? new Date().getFullYear();
  const month = parseIntParam(req.query.month);
  const classId = (req.query.classId as string) || undefined;
  const search = ((req.query.search as string) || "").trim();
  const status = STATUSES.includes(req.query.status as PaymentStatus)
    ? (req.query.status as PaymentStatus)
    : undefined;

  const classWhere: any = { userId };
  if (classId) classWhere.id = classId;

  const classes = await prisma.class.findMany({
    where: classWhere,
    include: {
      periods: {
        where: { year, ...(month ? { month } : {}) },
        orderBy: [{ year: "asc" }, { month: "asc" }],
      },
    },
    orderBy: { createdAt: "asc" },
  });
  const classIds = classes.map((c) => c.id);

  const studentWhere: any = { classId: { in: classIds } };
  if (search) studentWhere.fullName = { contains: search, mode: "insensitive" };

  const students = await prisma.student.findMany({
    where: studentWhere,
    include: {
      payments: {
        where: { period: { year, ...(month ? { month } : {}) } },
        include: { period: true },
      },
    },
    orderBy: [{ classId: "asc" }, { stt: "asc" }, { fullName: "asc" }],
  });

  const now = new Date();
  const classOrder = new Map(classIds.map((id, i) => [id, i]));

  const rows = students
    .map((s) => ({
      id: s.id,
      stt: s.stt,
      fullName: s.fullName,
      classId: s.classId,
      monthlyTuitionFee: toNumber(s.monthlyTuitionFee),
      active: s.active,
      payments: s.payments.map((p) => serializePayment(p, now)),
    }))
    .filter((s) => !status || s.payments.some((p) => p.status === status))
    .sort((a, b) => (classOrder.get(a.classId)! - classOrder.get(b.classId)!));

  const columnKeys = new Set<string>();
  for (const c of classes) for (const p of c.periods) columnKeys.add(`${p.year}-${p.month}`);
  const columns = [...columnKeys]
    .map((k) => {
      const [y, m] = k.split("-").map(Number);
      return { year: y, month: m };
    })
    .sort((a, b) => a.year - b.year || a.month - b.month);

  res.json({
    year,
    years: years.length ? years : [year],
    columns,
    classes: classes.map((c) => ({
      id: c.id,
      name: c.name,
      periods: c.periods.map(serializePeriod),
    })),
    students: rows,
  });
}

async function findOwnedPayment(paymentId: string, userId: string) {
  const payment = await prisma.tuitionPayment.findFirst({
    where: { id: paymentId, student: { class: { userId } } },
    include: { period: true },
  });
  if (!payment) throw new AppError("Không tìm thấy khoản học phí.", 404);
  return payment;
}

export async function updatePayment(req: Request, res: Response) {
  const userId = req.ownerId!;
  const existing = await findOwnedPayment(req.params.id, userId);
  const body = req.body ?? {};

  if (body.isPaid !== undefined && typeof body.isPaid !== "boolean") {
    throw new AppError("Trường isPaid phải là true hoặc false.");
  }
  const input = {
    isPaid: body.isPaid as boolean | undefined,
    paidAmount: body.paidAmount !== undefined ? parseMoney(body.paidAmount, "Số tiền đã đóng") : undefined,
    paidDate: body.paidDate !== undefined ? parseDateInput(body.paidDate, "Ngày đóng") : undefined,
    note: body.note !== undefined ? (body.note ? String(body.note).slice(0, 500) : null) : undefined,
  };

  const updated = await prisma.tuitionPayment.update({
    where: { id: existing.id },
    data: buildPaymentUpdate(
      { expectedAmount: toNumber(existing.expectedAmount), paidDate: existing.paidDate },
      input
    ),
    include: { period: true },
  });
  res.json(serializePayment(updated));
}

export async function bulkMarkPaid(req: Request, res: Response) {
  const userId = req.ownerId!;
  const ids: unknown = req.body?.paymentIds;
  if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== "string")) {
    throw new AppError("Danh sách khoản học phí không hợp lệ.");
  }
  if (ids.length > 1000) throw new AppError("Chỉ được chọn tối đa 1000 khoản mỗi lần.");

  const payments = await prisma.tuitionPayment.findMany({
    where: { id: { in: ids as string[] }, student: { class: { userId } } },
  });
  const now = new Date();
  await prisma.$transaction(
    payments
      .filter((p) => !p.isPaid)
      .map((p) =>
        prisma.tuitionPayment.update({
          where: { id: p.id },
          data: buildPaymentUpdate(
            { expectedAmount: toNumber(p.expectedAmount), paidDate: p.paidDate },
            { isPaid: true },
            now
          ),
        })
      )
  );
  const updated = await prisma.tuitionPayment.findMany({
    where: { id: { in: payments.map((p) => p.id) } },
    include: { period: true },
  });
  res.json({ updated: updated.map((p) => serializePayment(p, now)) });
}

/** Enrolls a student in one period of their class (turns a "—" cell into an unpaid one). */
export async function createPayment(req: Request, res: Response) {
  const userId = req.ownerId!;
  const { studentId, periodId } = req.body ?? {};
  if (typeof studentId !== "string" || typeof periodId !== "string") {
    throw new AppError("Thiếu học sinh hoặc kỳ học phí.");
  }
  const student = await prisma.student.findFirst({ where: { id: studentId, class: { userId } } });
  if (!student) throw new AppError("Không tìm thấy học sinh.", 404);
  const period = await prisma.tuitionPeriod.findFirst({ where: { id: periodId, classId: student.classId } });
  if (!period) throw new AppError("Kỳ học phí không thuộc lớp của học sinh này.", 400);

  const created = await prisma.tuitionPayment.create({
    data: { studentId, periodId, expectedAmount: student.monthlyTuitionFee },
    include: { period: true },
  });
  res.status(201).json(serializePayment(created));
}

/** Un-enrolls a student from a period (the cell becomes "—"). */
export async function deletePayment(req: Request, res: Response) {
  const userId = req.ownerId!;
  const existing = await findOwnedPayment(req.params.id, userId);
  await prisma.tuitionPayment.delete({ where: { id: existing.id } });
  res.status(204).end();
}

export default { getTuitionGrid, updatePayment, bulkMarkPaid, createPayment, deletePayment };
