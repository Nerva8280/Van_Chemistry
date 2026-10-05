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
    parentPhone: student.parentPhone,
    parentContactName: student.parentContactName ?? null,
    parentFacebook: !!student.parentFacebook,
    parentZalo: !!student.parentZalo,
    monthlyTuitionFee: toNumber(student.monthlyTuitionFee),
    active: student.active,
    createdAt: student.createdAt,
    class: student.class
      ? {
          id: student.class.id,
          name: student.class.name,
          defaultTuitionFee: toNumber(student.class.defaultTuitionFee),
          userId: student.class.userId,
          createdAt: student.class.createdAt,
        }
      : undefined,
  };
}

/** A contact name needs at least one channel (Facebook/Zalo), and a channel needs a name. */
export function parseParentContact(body: any) {
  const name = typeof body?.parentContactName === "string" ? body.parentContactName.trim().slice(0, 100) : "";
  const parentFacebook = body?.parentFacebook === true;
  const parentZalo = body?.parentZalo === true;
  if (name && !parentFacebook && !parentZalo) {
    throw new AppError("Hãy tick chọn Facebook hoặc Zalo cho tên liên hệ của phụ huynh.");
  }
  if (!name && (parentFacebook || parentZalo)) {
    throw new AppError("Vui lòng nhập tên Facebook/Zalo của phụ huynh.");
  }
  return { parentContactName: name || null, parentFacebook, parentZalo };
}

async function assertClassOwnership(classId: string, userId: string) {
  const cls = await prisma.class.findFirst({ where: { id: classId, userId } });
  if (!cls) {
    throw new AppError("Lớp học không hợp lệ hoặc không tồn tại.", 400);
  }
  return cls;
}

export async function listStudents(req: Request, res: Response) {
  const userId = req.ownerId!;
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
  const userId = req.ownerId!;
  const { fullName, classId, parentPhone, monthlyTuitionFee } = req.body ?? {};

  if (!fullName || typeof fullName !== "string" || !fullName.trim()) {
    throw new AppError("Họ và tên học sinh là bắt buộc.");
  }
  const contact = parseParentContact(req.body);
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
        parentPhone: parentPhone || null,
        ...contact,
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
  const userId = req.ownerId!;
  const { id } = req.params;
  const { fullName, classId, parentPhone, monthlyTuitionFee, active } = req.body ?? {};

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
  if (parentPhone !== undefined) data.parentPhone = parentPhone || null;
  const body = req.body ?? {};
  if (body.parentContactName !== undefined || body.parentFacebook !== undefined || body.parentZalo !== undefined) {
    Object.assign(data, parseParentContact(body));
  }
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
  const userId = req.ownerId!;
  const { id } = req.params;

  const existing = await prisma.student.findFirst({ where: { id, class: { userId } } });
  if (!existing) {
    throw new AppError("Không tìm thấy học sinh.", 404);
  }

  await prisma.student.delete({ where: { id } });

  res.status(204).end();
}

export async function importStudents(req: Request, res: Response) {
  const userId = req.ownerId!;
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
            parentPhone: row.parentPhone,
            parentContactName: row.parentContactName,
            parentFacebook: row.parentFacebook,
            parentZalo: row.parentZalo,
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
  const userId = req.ownerId!;
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
      parentPhone: s.parentPhone,
      parentContactName: s.parentContactName,
      parentFacebook: s.parentFacebook,
      parentZalo: s.parentZalo,
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
