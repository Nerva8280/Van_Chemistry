import { Request, Response } from "express";
import prisma from "../config/db";
import { toNumber } from "../utils/money";
import { AppError } from "../middleware/errorHandler";
import { createPaymentsForNewStudent } from "../services/tuition.service";
import {
  parseStudentsImportFile,
  buildStudentsExportWorkbook,
  ImportRowError,
} from "../services/excel.service";

function serializeStudent(student: any) {
  return {
    id: student.id,
    stt: student.stt ?? null,
    fullName: student.fullName,
    classId: student.classId,
    parentEmail: student.parentEmail,
    parentPhone: student.parentPhone,
    monthlyTuitionFee: toNumber(student.monthlyTuitionFee),
    active: student.active,
    createdAt: student.createdAt,
    class: student.class
      ? {
          id: student.class.id,
          name: student.class.name,
          sheetName: student.class.sheetName ?? null,
          defaultTuitionFee: toNumber(student.class.defaultTuitionFee),
          userId: student.class.userId,
          createdAt: student.class.createdAt,
        }
      : undefined,
  };
}

async function assertClassOwnership(classId: string, userId: string) {
  const cls = await prisma.class.findFirst({ where: { id: classId, userId } });
  if (!cls) {
    throw new AppError("Lớp học không hợp lệ hoặc không tồn tại.", 400);
  }
  return cls;
}

export async function listStudents(req: Request, res: Response) {
  const userId = req.user!.id;
  const { classId, search } = req.query as { classId?: string; search?: string };

  const where: any = { class: { userId } };
  if (classId) {
    where.classId = classId;
  }
  if (search && search.trim()) {
    where.fullName = { contains: search.trim(), mode: "insensitive" };
  }

  const students = await prisma.student.findMany({
    where,
    include: { class: true },
    orderBy: { fullName: "asc" },
  });

  res.json(students.map(serializeStudent));
}

export async function createStudent(req: Request, res: Response) {
  const userId = req.user!.id;
  const { fullName, classId, parentEmail, parentPhone, monthlyTuitionFee } = req.body ?? {};

  if (!fullName || typeof fullName !== "string" || !fullName.trim()) {
    throw new AppError("Họ và tên học sinh là bắt buộc.");
  }
  if (!classId || typeof classId !== "string") {
    throw new AppError("Lớp học là bắt buộc.");
  }
  const fee = Number(monthlyTuitionFee);
  if (!Number.isFinite(fee) || fee <= 0) {
    throw new AppError("Học phí hàng tháng không hợp lệ.");
  }

  await assertClassOwnership(classId, userId);

  const student = await prisma.$transaction(async (tx) => {
    const created = await tx.student.create({
      data: {
        fullName: fullName.trim(),
        classId,
        parentEmail: parentEmail || null,
        parentPhone: parentPhone || null,
        monthlyTuitionFee: fee,
      },
      include: { class: true },
    });

    await createPaymentsForNewStudent(tx, { studentId: created.id, classId, fee });

    return created;
  });

  res.status(201).json(serializeStudent(student));
}

export async function updateStudent(req: Request, res: Response) {
  const userId = req.user!.id;
  const { id } = req.params;
  const { fullName, classId, parentEmail, parentPhone, monthlyTuitionFee, active } = req.body ?? {};

  const existing = await prisma.student.findFirst({
    where: { id, class: { userId } },
    include: { class: true },
  });
  if (!existing) {
    throw new AppError("Không tìm thấy học sinh.", 404);
  }

  const data: Record<string, unknown> = {};

  if (fullName !== undefined) {
    if (typeof fullName !== "string" || !fullName.trim()) {
      throw new AppError("Họ và tên không hợp lệ.");
    }
    data.fullName = fullName.trim();
  }
  if (classId !== undefined) {
    await assertClassOwnership(classId, userId);
    data.classId = classId;
  }
  if (parentEmail !== undefined) data.parentEmail = parentEmail || null;
  if (parentPhone !== undefined) data.parentPhone = parentPhone || null;
  if (monthlyTuitionFee !== undefined) {
    const fee = Number(monthlyTuitionFee);
    if (!Number.isFinite(fee) || fee <= 0) {
      throw new AppError("Học phí hàng tháng không hợp lệ.");
    }
    data.monthlyTuitionFee = fee;
  }
  if (active !== undefined) data.active = Boolean(active);

  const student = await prisma.$transaction(async (tx) => {
    const updated = await tx.student.update({ where: { id }, data, include: { class: true } });
    if (data.monthlyTuitionFee !== undefined) {
      await tx.tuitionPayment.updateMany({
        where: { studentId: id, isPaid: false },
        data: { expectedAmount: data.monthlyTuitionFee as number },
      });
    }
    return updated;
  });

  res.json(serializeStudent(student));
}

export async function deleteStudent(req: Request, res: Response) {
  const userId = req.user!.id;
  const { id } = req.params;

  const existing = await prisma.student.findFirst({ where: { id, class: { userId } } });
  if (!existing) {
    throw new AppError("Không tìm thấy học sinh.", 404);
  }

  await prisma.student.delete({ where: { id } });

  res.status(204).end();
}

export async function importStudents(req: Request, res: Response) {
  const userId = req.user!.id;
  const file = (req as any).file as Express.Multer.File | undefined;
  const bodyClassId = (req.body?.classId as string | undefined) || undefined;

  if (!file) {
    throw new AppError("Vui lòng chọn file .xlsx hoặc .csv để nhập.", 400);
  }

  let overrideClass: { id: string } | null = null;
  if (bodyClassId) {
    overrideClass = await assertClassOwnership(bodyClassId, userId);
  }

  const { rows, errors: parseErrors } = parseStudentsImportFile(file.buffer);
  const errors: ImportRowError[] = [...parseErrors];

  if (rows.length === 0) {
    return res.json({ imported: 0, errors });
  }

  // Resolve class per row (by name) unless a classId override was provided.
  const userClasses = await prisma.class.findMany({ where: { userId } });
  const classByName = new Map(userClasses.map((c) => [c.name.trim().toLowerCase(), c]));

  let imported = 0;

  for (const row of rows) {
    let targetClassId: string | null = overrideClass?.id ?? null;

    if (!targetClassId) {
      if (!row.className) {
        errors.push({ row: row.row, message: `Thiếu "Lớp" và không có lớp mặc định được chọn.` });
        continue;
      }
      const matched = classByName.get(row.className.trim().toLowerCase());
      if (!matched) {
        errors.push({ row: row.row, message: `Lớp "${row.className}" không tồn tại.` });
        continue;
      }
      targetClassId = matched.id;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const created = await tx.student.create({
          data: {
            fullName: row.fullName,
            classId: targetClassId as string,
            parentEmail: row.parentEmail,
            parentPhone: row.parentPhone,
            monthlyTuitionFee: row.monthlyTuitionFee,
          },
        });
        await createPaymentsForNewStudent(tx, {
          studentId: created.id,
          classId: targetClassId as string,
          fee: row.monthlyTuitionFee,
        });
      });
      imported += 1;
    } catch (err: any) {
      errors.push({ row: row.row, message: `Lỗi khi lưu dữ liệu: ${err.message ?? "không xác định"}` });
    }
  }

  res.json({ imported, errors });
}

export async function exportStudents(req: Request, res: Response) {
  const userId = req.user!.id;
  const { classId } = req.query as { classId?: string };

  const where: any = { class: { userId } };
  if (classId) where.classId = classId;

  const students = await prisma.student.findMany({
    where,
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

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", 'attachment; filename="danh-sach-hoc-sinh.xlsx"');
  res.send(buffer);
}

export default {
  listStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  importStudents,
  exportStudents,
};
