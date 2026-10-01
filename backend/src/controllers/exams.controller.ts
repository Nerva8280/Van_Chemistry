import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../config/db";
import { AppError } from "../middleware/errorHandler";
import env from "../config/env";
import { MSG_NOT_CONFIGURED, ocrWithFallback, validateImages } from "../services/exam-ocr.service";

const MAX_TITLE = 200;
const MAX_BYTES = 12 * 1024 * 1024;

function serializeExam(exam: any, includeData: boolean) {
  const data = exam.data as any;
  const out: Record<string, unknown> = {
    id: exam.id,
    title: exam.title,
    sourceName: exam.sourceName ?? null,
    versionCount: Array.isArray(data?.versions) ? data.versions.length : 0,
    sizeBytes: exam.sizeBytes,
    createdAt: exam.createdAt,
    updatedAt: exam.updatedAt,
  };
  if (includeData) out.data = exam.data;
  return out;
}

function parseTitle(title: unknown): string {
  if (typeof title !== "string" || !title.trim()) {
    throw new AppError("Tên đề là bắt buộc.");
  }
  const t = title.trim();
  if (t.length > MAX_TITLE) {
    throw new AppError(`Tên đề quá dài (tối đa ${MAX_TITLE} ký tự).`);
  }
  return t;
}

function parseData(data: unknown): { data: Prisma.InputJsonValue; sizeBytes: number } {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new AppError("Dữ liệu đề không hợp lệ.");
  }
  const doc = (data as any).doc;
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.sections)) {
    throw new AppError("Dữ liệu đề không hợp lệ (thiếu danh sách phần thi).");
  }
  const sizeBytes = Buffer.byteLength(JSON.stringify(data));
  if (sizeBytes > MAX_BYTES) {
    throw new AppError(
      "Đề quá lớn để lưu (trên 12 MB), thường do có nhiều ảnh dung lượng lớn. Hãy giảm kích thước ảnh trong file Word rồi tải lên lại.",
      413
    );
  }
  return { data: data as Prisma.InputJsonValue, sizeBytes };
}

async function findOwned(id: string, userId: string) {
  const exam = await prisma.exam.findFirst({ where: { id, userId } });
  if (!exam) throw new AppError("Không tìm thấy đề.", 404);
  return exam;
}

export async function listExams(req: Request, res: Response) {
  const userId = req.ownerId!;
  // Không tải cột data (có thể vài MB mỗi đề); số mã đề đọc thẳng trong JSONB.
  const rows = await prisma.$queryRaw<
    {
      id: string;
      title: string;
      sourceName: string | null;
      versionCount: number | null;
      sizeBytes: number;
      createdAt: Date;
      updatedAt: Date;
    }[]
  >`
    SELECT "id", "title", "sourceName", "sizeBytes", "createdAt", "updatedAt",
           CASE WHEN jsonb_typeof("data"->'versions') = 'array'
                THEN jsonb_array_length("data"->'versions') ELSE 0 END AS "versionCount"
    FROM "Exam"
    WHERE "userId" = ${userId}
    ORDER BY "updatedAt" DESC
  `;
  const exams = rows.map((r) => ({
    id: r.id,
    title: r.title,
    sourceName: r.sourceName,
    versionCount: Number(r.versionCount ?? 0),
    sizeBytes: Number(r.sizeBytes),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
  const totalBytes = exams.reduce((sum, e) => sum + e.sizeBytes, 0);
  res.json({ exams, totalBytes });
}

export async function getExam(req: Request, res: Response) {
  const exam = await findOwned(req.params.id, req.ownerId!);
  res.json(serializeExam(exam, true));
}

export async function createExam(req: Request, res: Response) {
  const userId = req.ownerId!;
  const { title, sourceName, data } = req.body ?? {};
  const cleanTitle = parseTitle(title);
  const parsed = parseData(data);
  let source: string | null = null;
  if (sourceName !== undefined && sourceName !== null) {
    if (typeof sourceName !== "string") throw new AppError("Tên file gốc không hợp lệ.");
    source = sourceName.trim().slice(0, 255) || null;
  }
  const exam = await prisma.exam.create({
    data: { userId, title: cleanTitle, sourceName: source, data: parsed.data, sizeBytes: parsed.sizeBytes },
  });
  res.status(201).json(serializeExam(exam, true));
}

export async function updateExam(req: Request, res: Response) {
  const userId = req.ownerId!;
  const { id } = req.params;
  await findOwned(id, userId);
  const { title, data } = req.body ?? {};

  const patch: Prisma.ExamUpdateInput = {};
  if (title !== undefined) patch.title = parseTitle(title);
  if (data !== undefined) {
    const parsed = parseData(data);
    patch.data = parsed.data;
    patch.sizeBytes = parsed.sizeBytes;
  }
  const exam = await prisma.exam.update({ where: { id }, data: patch });
  res.json(serializeExam(exam, true));
}

export async function deleteExam(req: Request, res: Response) {
  const userId = req.ownerId!;
  const { id } = req.params;
  await findOwned(id, userId);
  await prisma.exam.delete({ where: { id } });
  res.status(204).end();
}

/** Đọc ảnh chụp đề thi bằng Gemini, trả cấu trúc đề (frontend dựng ExamDoc và làm sạch HTML). */
export async function ocrExam(req: Request, res: Response) {
  if (!env.GEMINI_API_KEY) throw new AppError(MSG_NOT_CONFIGURED, 503);
  const images = validateImages(req.body);
  const out = await ocrWithFallback(images, {
    apiKey: env.GEMINI_API_KEY,
    models: [env.GEMINI_MODEL, ...env.GEMINI_FALLBACK_MODELS.split(",").map((m) => m.trim())],
  });
  res.json(out);
}

export default { listExams, getExam, createExam, updateExam, deleteExam, ocrExam };
