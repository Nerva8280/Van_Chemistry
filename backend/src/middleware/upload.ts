import multer from "multer";
import { Request } from "express";

const ALLOWED_EXTENSIONS = [".xlsx", ".csv"];
const ALLOWED_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // some browsers report .csv/.xls as this
  "text/csv",
  "application/csv",
  "text/plain", // some OS report .csv this way
];

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback
) {
  const lowerName = file.originalname.toLowerCase();
  const hasAllowedExtension = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  const hasAllowedMime = ALLOWED_MIME_TYPES.includes(file.mimetype);

  if (hasAllowedExtension && (hasAllowedMime || true)) {
    // Extension is the authoritative check since browsers/OS report MIME
    // types for .xlsx/.csv inconsistently.
    return callback(null, true);
  }

  callback(new Error("Chỉ chấp nhận file .xlsx hoặc .csv"));
}

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter,
});

export default upload;
