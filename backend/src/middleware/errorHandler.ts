import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { MulterError } from "multer";

export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
    this.name = "AppError";
  }
}

/**
 * Central error handler. Must be registered last, after all routes.
 * Always responds with { error: string } per the contract.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    return next(err);
  }

  // eslint-disable-next-line no-console
  console.error("[error]", err);

  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message });
  }

  if (err instanceof MulterError) {
    return res.status(400).json({ error: `Lỗi tải file: ${err.message}` });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Dữ liệu đã tồn tại (vi phạm ràng buộc duy nhất)." });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Không tìm thấy dữ liệu." });
    }
    return res.status(400).json({ error: "Lỗi cơ sở dữ liệu: " + err.message });
  }

  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Dữ liệu JSON gửi lên không hợp lệ." });
  }

  const status = err?.status || err?.statusCode || 500;
  const message = err?.message || "Đã xảy ra lỗi không xác định trên máy chủ.";
  return res.status(status).json({ error: message });
}

export default errorHandler;
