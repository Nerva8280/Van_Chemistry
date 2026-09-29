import { Request, Response } from "express";
import prisma from "../config/db";
import { AppError } from "../middleware/errorHandler";
import { buildDueDate } from "../services/overdue.service";
import { createPaymentsForNewPeriod, serializePeriod } from "../services/tuition.service";

async function assertClass(classId: string, userId: string) {
  const cls = await prisma.class.findFirst({ where: { id: classId, userId } });
  if (!cls) throw new AppError("Không tìm thấy lớp học.", 404);
  return cls;
}

function parseDate(value: unknown, field: string, required: boolean): Date | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw new AppError(`${field} là bắt buộc.`);
    return null;
  }
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) throw new AppError(`${field} không hợp lệ.`);
  return d;
}

function parseYearMonth(body: any) {
  const year = Number(body.year);
  const month = Number(body.month);
  if (!Number.isInteger(year) || year < 2000 || year > 3000) throw new AppError("Năm không hợp lệ.");
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new AppError("Tháng không hợp lệ (1-12).");
  return { year, month };
}

function assertRange(start: Date | null, end: Date | null) {
  if (start && end && start > end) throw new AppError("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");
}

export async function listPeriods(req: Request, res: Response) {
  const cls = await assertClass(req.params.id, req.user!.id);
  const periods = await prisma.tuitionPeriod.findMany({
    where: { classId: cls.id },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });
  res.json(periods.map(serializePeriod));
}

export async function createPeriod(req: Request, res: Response) {
  const cls = await assertClass(req.params.id, req.user!.id);
  const body = req.body ?? {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) throw new AppError("Tên kỳ học phí là bắt buộc.");
  const { year, month } = parseYearMonth(body);
  const startDate = parseDate(body.startDate, "Ngày bắt đầu", false);
  const endDate = parseDate(body.endDate, "Ngày kết thúc", false);
  const dueDate = parseDate(body.dueDate, "Hạn đóng", false);
  assertRange(startDate, endDate);

  const exists = await prisma.tuitionPeriod.findUnique({
    where: { classId_year_month: { classId: cls.id, year, month } },
  });
  if (exists) throw new AppError(`Lớp này đã có kỳ học phí cho tháng ${month}/${year}.`, 409);

  const period = await prisma.$transaction(async (tx) => {
    const created = await tx.tuitionPeriod.create({
      data: { classId: cls.id, name, year, month, startDate, endDate, dueDate },
    });
    await createPaymentsForNewPeriod(tx, { periodId: created.id, classId: cls.id });
    return created;
  });
  res.status(201).json(serializePeriod(period));
}

/** Creates the missing calendar-month periods (Tháng 1..12) of a year for a class. */
export async function generateMonthlyPeriods(req: Request, res: Response) {
  const cls = await assertClass(req.params.id, req.user!.id);
  const year = Number(req.body?.year);
  if (!Number.isInteger(year) || year < 2000 || year > 3000) throw new AppError("Năm không hợp lệ.");
  const rawDueDay = req.body?.dueDay;
  const dueDay = rawDueDay !== undefined && rawDueDay !== null && rawDueDay !== "" ? Number(rawDueDay) : undefined;
  if (dueDay !== undefined && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28)) {
    throw new AppError("Ngày hạn đóng phải từ 1 đến 28.");
  }

  const existing = await prisma.tuitionPeriod.findMany({ where: { classId: cls.id, year } });
  const taken = new Set(existing.map((p) => p.month));

  const created = await prisma.$transaction(async (tx) => {
    const out = [];
    for (let month = 1; month <= 12; month++) {
      if (taken.has(month)) continue;
      const period = await tx.tuitionPeriod.create({
        data: {
          classId: cls.id,
          name: `Tháng ${month}`,
          year,
          month,
          startDate: new Date(year, month - 1, 1),
          endDate: new Date(year, month, 0),
          dueDate: dueDay !== undefined ? buildDueDate(year, month, dueDay) : null,
        },
      });
      await createPaymentsForNewPeriod(tx, { periodId: period.id, classId: cls.id });
      out.push(period);
    }
    return out;
  });
  res.status(201).json({ created: created.length, periods: created.map(serializePeriod) });
}

async function findOwnedPeriod(id: string, userId: string) {
  const period = await prisma.tuitionPeriod.findFirst({ where: { id, class: { userId } } });
  if (!period) throw new AppError("Không tìm thấy kỳ học phí.", 404);
  return period;
}

export async function updatePeriod(req: Request, res: Response) {
  const period = await findOwnedPeriod(req.params.id, req.user!.id);
  const body = req.body ?? {};
  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) throw new AppError("Tên kỳ học phí không hợp lệ.");
    data.name = name;
  }
  if (body.year !== undefined || body.month !== undefined) {
    const { year, month } = parseYearMonth({ year: body.year ?? period.year, month: body.month ?? period.month });
    if (year !== period.year || month !== period.month) {
      const clash = await prisma.tuitionPeriod.findUnique({
        where: { classId_year_month: { classId: period.classId, year, month } },
      });
      if (clash) throw new AppError(`Lớp này đã có kỳ học phí cho tháng ${month}/${year}.`, 409);
    }
    data.year = year;
    data.month = month;
  }
  if (body.startDate !== undefined) data.startDate = parseDate(body.startDate, "Ngày bắt đầu", false);
  if (body.endDate !== undefined) data.endDate = parseDate(body.endDate, "Ngày kết thúc", false);
  if (body.dueDate !== undefined) data.dueDate = parseDate(body.dueDate, "Hạn đóng", false);
  assertRange(
    (data.startDate as Date | null | undefined) ?? period.startDate,
    (data.endDate as Date | null | undefined) ?? period.endDate
  );

  const updated = await prisma.tuitionPeriod.update({ where: { id: period.id }, data });
  res.json(serializePeriod(updated));
}

export async function deletePeriod(req: Request, res: Response) {
  const period = await findOwnedPeriod(req.params.id, req.user!.id);
  await prisma.tuitionPeriod.delete({ where: { id: period.id } });
  res.status(204).end();
}

export default { listPeriods, createPeriod, generateMonthlyPeriods, updatePeriod, deletePeriod };
