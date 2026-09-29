import { Request, Response } from "express";
import prisma from "../config/db";
import { toNumber } from "../utils/money";
import { AppError } from "../middleware/errorHandler";

function serializeClass(cls: any) {
  return {
    id: cls.id,
    name: cls.name,
    defaultTuitionFee: toNumber(cls.defaultTuitionFee),
    userId: cls.userId,
    createdAt: cls.createdAt,
    studentCount: cls._count ? cls._count.students : cls.studentCount ?? undefined,
  };
}

export async function listClasses(req: Request, res: Response) {
  const userId = req.user!.id;
  const classes = await prisma.class.findMany({
    where: { userId },
    include: { _count: { select: { students: true } } },
    orderBy: { createdAt: "asc" },
  });
  res.json(classes.map(serializeClass));
}

export async function createClass(req: Request, res: Response) {
  const userId = req.user!.id;
  const { name, defaultTuitionFee } = req.body ?? {};

  if (!name || typeof name !== "string" || !name.trim()) {
    throw new AppError("Tên lớp là bắt buộc.");
  }
  const fee = Number(defaultTuitionFee);
  if (!Number.isFinite(fee) || fee < 0) {
    throw new AppError("Học phí mặc định không hợp lệ.");
  }

  const cls = await prisma.class.create({
    data: { name: name.trim(), defaultTuitionFee: fee, userId },
    include: { _count: { select: { students: true } } },
  });

  res.status(201).json(serializeClass(cls));
}

export async function updateClass(req: Request, res: Response) {
  const userId = req.user!.id;
  const { id } = req.params;
  const { name, defaultTuitionFee } = req.body ?? {};

  const existing = await prisma.class.findFirst({ where: { id, userId } });
  if (!existing) {
    throw new AppError("Không tìm thấy lớp học.", 404);
  }

  const data: Record<string, unknown> = {};
  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      throw new AppError("Tên lớp không hợp lệ.");
    }
    data.name = name.trim();
  }
  if (defaultTuitionFee !== undefined) {
    const fee = Number(defaultTuitionFee);
    if (!Number.isFinite(fee) || fee < 0) {
      throw new AppError("Học phí mặc định không hợp lệ.");
    }
    data.defaultTuitionFee = fee;
  }

  const cls = await prisma.class.update({
    where: { id },
    data,
    include: { _count: { select: { students: true } } },
  });

  res.json(serializeClass(cls));
}

export async function deleteClass(req: Request, res: Response) {
  const userId = req.user!.id;
  const { id } = req.params;

  const existing = await prisma.class.findFirst({ where: { id, userId } });
  if (!existing) {
    throw new AppError("Không tìm thấy lớp học.", 404);
  }

  const studentCount = await prisma.student.count({ where: { classId: id } });
  if (studentCount > 0) {
    throw new AppError(
      "Không thể xóa lớp học vì vẫn còn học sinh thuộc lớp này. Vui lòng chuyển hoặc xóa học sinh trước.",
      409
    );
  }

  await prisma.class.delete({ where: { id } });
  res.status(204).end();
}

export default { listClasses, createClass, updateClass, deleteClass };
