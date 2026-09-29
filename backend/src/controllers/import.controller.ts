import { Request, Response } from "express";
import { AppError } from "../middleware/errorHandler";
import {
  buildTuitionTemplate,
  commitTuitionImport,
  previewTuitionImport,
} from "../services/tuition-import.service";

function parseOptions(body: any) {
  const year = Number(body?.year ?? new Date().getFullYear());
  if (!Number.isInteger(year) || year < 2000 || year > 3000) throw new AppError("Năm không hợp lệ.");
  const unit = Number(body?.unit ?? 1);
  if (unit !== 1 && unit !== 1000) throw new AppError("Đơn vị tiền không hợp lệ.");
  return { year, unit };
}

/** Always returns the preview; writes to the database only when `commit` is "true". */
export async function importTuition(req: Request, res: Response) {
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) throw new AppError("Vui lòng chọn file Excel (.xlsx) để nhập.");
  const opts = parseOptions(req.body);

  let result;
  try {
    result = await previewTuitionImport(req.user!.id, file.buffer, opts);
  } catch (err: any) {
    throw new AppError(`Không đọc được file: ${err?.message ?? "lỗi không xác định"}`);
  }
  const { preview, plans } = result;

  if (String(req.body?.commit) !== "true") {
    return res.json({ committed: false, preview });
  }
  if (plans.length === 0) throw new AppError("File không có học sinh nào để nhập.");
  const imported = await commitTuitionImport(req.user!.id, plans);
  res.json({ committed: true, preview, imported });
}

export async function downloadTemplate(_req: Request, res: Response) {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="mau-nhap-hoc-phi.xlsx"');
  res.send(buildTuitionTemplate());
}

export default { importTuition, downloadTemplate };
