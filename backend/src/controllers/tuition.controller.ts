import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
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

/** Years with data plus this year and next, newest first, so upcoming months can be planned. */
async function listYears(userId: string): Promise<number[]> {
  const rows = await prisma.tuitionPeriod.findMany({
    where: { class: { userId } },
    distinct: ["year"],
    select: { year: true },
  });
  const now = new Date().getFullYear();
  return [...new Set([...rows.map((r) => r.year), now, now + 1])].sort((a, b) => b - a);
}

/** The grid shows one quarter (3 months) per page: quarter 1 = Tháng 1-3, ... quarter 4 = Tháng 10-12. */
export async function getTuitionGrid(req: Request, res: Response) {
  const userId = req.ownerId!;
  const today = new Date();
  const years = await listYears(userId);
  const year = parseIntParam(req.query.year) ?? today.getFullYear();
  const q = parseIntParam(req.query.quarter);
  const quarter = q && q >= 1 && q <= 4 ? q : Math.floor(today.getMonth() / 3) + 1;
  const months = [quarter * 3 - 2, quarter * 3 - 1, quarter * 3];
  const classId = (req.query.classId as string) || undefined;
  const search = ((req.query.search as string) || "").trim();
  const status = STATUSES.includes(req.query.status as PaymentStatus)
    ? (req.query.status as PaymentStatus)
    : undefined;
  // Optional: apply the status filter to one month of the page only (matches the dashboard's monthly counts).
  const statusMonth = parseIntParam(req.query.statusMonth);

  const classWhere: any = { userId };
  if (classId) classWhere.id = classId;

  const classes = await prisma.class.findMany({
    where: classWhere,
    include: {
      periods: {
        where: { year, month: { in: months } },
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
        where: { period: { year, month: { in: months } } },
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
    .filter(
      (s) => !status || s.payments.some((p) => p.status === status && (!statusMonth || p.month === statusMonth))
    )
    .sort((a, b) => (classOrder.get(a.classId)! - classOrder.get(b.classId)!));

  // Latest period of each class before this page, to prefill the start date of the next one.
  const earlier = await prisma.tuitionPeriod.findMany({
    where: {
      classId: { in: classIds },
      OR: [{ year: { lt: year } }, { year, month: { lt: months[0] } }],
    },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  const previousByClass = new Map<string, (typeof earlier)[number]>();
  for (const p of earlier) if (!previousByClass.has(p.classId)) previousByClass.set(p.classId, p);

  res.json({
    year,
    quarter,
    years: years.includes(year) ? years : [...years, year].sort((a, b) => b - a),
    columns: months.map((m) => ({ year, month: m })),
    classes: classes.map((c) => {
      const prev = previousByClass.get(c.id);
      return {
        id: c.id,
        name: c.name,
        periods: c.periods.map(serializePeriod),
        previousPeriod: prev ? serializePeriod(prev) : null,
      };
    }),
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

  const data = buildPaymentUpdate(
    { expectedAmount: toNumber(existing.expectedAmount), paidDate: existing.paidDate },
    input
  );
  if (body.customStartDate !== undefined || body.customEndDate !== undefined) {
    const start = body.customStartDate !== undefined ? parseDateInput(body.customStartDate, "Ngày bắt đầu kỳ riêng") : existing.customStartDate;
    const end = body.customEndDate !== undefined ? parseDateInput(body.customEndDate, "Ngày kết thúc kỳ riêng") : existing.customEndDate;
    assertCustomRange(start, end);
    data.customStartDate = start;
    data.customEndDate = end;
  }

  const updated = await prisma.tuitionPayment.update({
    where: { id: existing.id },
    data,
    include: { period: true },
  });
  res.json(serializePayment(updated));
}

function assertCustomRange(start: Date | null, end: Date | null) {
  if (start && end && start > end) throw new AppError("Ngày bắt đầu kỳ riêng phải trước hoặc bằng ngày kết thúc.");
}

/**
 * Sets (or clears, with both dates null) a student's own period dates for the class period of
 * one month, for several students at once. Only students enrolled in that period are changed.
 */
export async function bulkCustomPeriod(req: Request, res: Response) {
  const userId = req.ownerId!;
  const { studentIds, year, month } = req.body ?? {};
  if (!Array.isArray(studentIds) || studentIds.length === 0 || studentIds.some((id) => typeof id !== "string")) {
    throw new AppError("Danh sách học sinh không hợp lệ.");
  }
  if (studentIds.length > 1000) throw new AppError("Chỉ được chọn tối đa 1000 học sinh mỗi lần.");
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) throw new AppError("Tháng hoặc năm không hợp lệ.");
  const start = parseDateInput(req.body?.startDate ?? null, "Ngày bắt đầu kỳ riêng");
  const end = parseDateInput(req.body?.endDate ?? null, "Ngày kết thúc kỳ riêng");
  assertCustomRange(start, end);

  const result = await prisma.tuitionPayment.updateMany({
    where: { studentId: { in: studentIds as string[] }, student: { class: { userId } }, period: { year: y, month: m } },
    data: { customStartDate: start, customEndDate: end },
  });
  res.json({ updated: result.count, notEnrolled: studentIds.length - result.count });
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

/**
 * Enrolls many students in the (year, month) period of their own class. Students already
 * enrolled are skipped; students whose class has no period that month are reported back.
 */
export async function bulkEnroll(req: Request, res: Response) {
  const userId = req.ownerId!;
  const { studentIds, year, month } = req.body ?? {};
  if (!Array.isArray(studentIds) || studentIds.length === 0 || studentIds.some((id) => typeof id !== "string")) {
    throw new AppError("Danh sách học sinh không hợp lệ.");
  }
  if (studentIds.length > 1000) throw new AppError("Chỉ được chọn tối đa 1000 học sinh mỗi lần.");
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) throw new AppError("Tháng hoặc năm không hợp lệ.");

  const students = await prisma.student.findMany({
    where: { id: { in: studentIds as string[] }, class: { userId } },
    include: { class: { include: { periods: { where: { year: y, month: m } } } } },
  });

  const toCreate: { studentId: string; periodId: string; expectedAmount: Prisma.Decimal }[] = [];
  const noPeriod: string[] = [];
  for (const s of students) {
    const period = s.class.periods[0];
    if (!period) noPeriod.push(s.fullName);
    else toCreate.push({ studentId: s.id, periodId: period.id, expectedAmount: s.monthlyTuitionFee });
  }
  const result = await prisma.tuitionPayment.createMany({ data: toCreate, skipDuplicates: true });

  res.json({
    created: result.count,
    alreadyEnrolled: toCreate.length - result.count,
    noPeriod,
  });
}

/**
 * Un-enrolls several students from their class's period of one month (cells become "—").
 * Payments that already hold money are kept unless includePaid is true, so a mis-click
 * can't silently erase a recorded payment.
 */
export async function bulkUnenroll(req: Request, res: Response) {
  const userId = req.ownerId!;
  const { studentIds, year, month, includePaid } = req.body ?? {};
  if (!Array.isArray(studentIds) || studentIds.length === 0 || studentIds.some((id) => typeof id !== "string")) {
    throw new AppError("Danh sách học sinh không hợp lệ.");
  }
  if (studentIds.length > 1000) throw new AppError("Chỉ được chọn tối đa 1000 học sinh mỗi lần.");
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) throw new AppError("Tháng hoặc năm không hợp lệ.");
  if (includePaid !== undefined && typeof includePaid !== "boolean") throw new AppError("Lựa chọn không hợp lệ.");

  const payments = await prisma.tuitionPayment.findMany({
    where: { studentId: { in: studentIds as string[] }, student: { class: { userId } }, period: { year: y, month: m } },
    select: { id: true, isPaid: true, paidAmount: true },
  });
  const hasMoney = (p: (typeof payments)[number]) => p.isPaid || toNumber(p.paidAmount) > 0;
  const toDelete = payments.filter((p) => includePaid === true || !hasMoney(p)).map((p) => p.id);
  if (toDelete.length) await prisma.tuitionPayment.deleteMany({ where: { id: { in: toDelete } } });

  res.json({
    removed: toDelete.length,
    keptPaid: payments.length - toDelete.length,
    notEnrolled: studentIds.length - payments.length,
  });
}

/** Un-enrolls a student from a period (the cell becomes "—"). */
export async function deletePayment(req: Request, res: Response) {
  const userId = req.ownerId!;
  const existing = await findOwnedPayment(req.params.id, userId);
  await prisma.tuitionPayment.delete({ where: { id: existing.id } });
  res.status(204).end();
}

export default {
  getTuitionGrid,
  updatePayment,
  bulkMarkPaid,
  bulkEnroll,
  bulkUnenroll,
  bulkCustomPeriod,
  createPayment,
  deletePayment,
};
