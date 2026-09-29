import * as XLSX from "xlsx";

// ---------------------------------------------------------------------------
// Import: students from .xlsx/.csv
// ---------------------------------------------------------------------------

export interface ImportRowError {
  row: number; // 1-based row number as seen in the spreadsheet (header = row 1)
  message: string;
}

export interface ParsedStudentRow {
  row: number;
  fullName: string;
  className: string | null; // raw "Lớp" cell value, may be empty if classId override is used
  parentEmail: string | null;
  parentPhone: string | null;
  monthlyTuitionFee: number;
}

export interface ParseStudentsResult {
  rows: ParsedStudentRow[];
  errors: ImportRowError[];
}

const HEADER_FULL_NAME = "Họ và tên";
const HEADER_CLASS = "Lớp";
const HEADER_PARENT_EMAIL = "Email phụ huynh";
const HEADER_PARENT_PHONE = "Số điện thoại";
const HEADER_TUITION_FEE = "Học phí";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9+()\-.\s]{8,15}$/;

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseFeeValue(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return raw;
  // Strip common thousands separators (dots, commas, spaces, "đ", "VND")
  const cleaned = String(raw)
    .replace(/[₫đĐ]/g, "")
    .replace(/vnd/gi, "")
    .replace(/[.,\s]/g, "")
    .trim();
  if (cleaned === "") return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

/**
 * Parses an uploaded .xlsx or .csv buffer of students, expecting the
 * Vietnamese column headers from the contract:
 *   Họ và tên | Lớp | Email phụ huynh | Số điện thoại | Học phí
 *
 * Returns parsed rows (structurally valid) plus a list of row-level errors
 * for rows that failed validation (missing name, invalid fee, invalid
 * email/phone format). Row numbers are 1-based counting the header as row 1,
 * so the first data row is row 2 — matching what a user sees in Excel.
 */
export function parseStudentsImportFile(buffer: Buffer): ParseStudentsResult {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], errors: [{ row: 0, message: "File không có dữ liệu (không có sheet nào)." }] };
  }

  const sheet = workbook.Sheets[sheetName];
  // raw: false returns the formatted/original text of each cell (cell.w) rather
  // than the type-coerced value (cell.v). This matters for phone numbers like
  // "0912345678": with raw:true, SheetJS's CSV/number auto-detection would
  // silently convert it to the number 912345678, dropping the leading zero.
  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });

  const rows: ParsedStudentRow[] = [];
  const errors: ImportRowError[] = [];

  if (raw.length === 0) {
    errors.push({ row: 0, message: "File không chứa dòng dữ liệu nào." });
    return { rows, errors };
  }

  raw.forEach((record, idx) => {
    const rowNumber = idx + 2; // header is row 1

    const fullName = cellToString(record[HEADER_FULL_NAME]);
    const className = cellToString(record[HEADER_CLASS]);
    const parentEmailRaw = cellToString(record[HEADER_PARENT_EMAIL]);
    const parentPhoneRaw = cellToString(record[HEADER_PARENT_PHONE]);
    const feeRaw = record[HEADER_TUITION_FEE];

    if (!fullName) {
      errors.push({ row: rowNumber, message: `Thiếu "${HEADER_FULL_NAME}".` });
      return;
    }

    const fee = parseFeeValue(feeRaw);
    if (fee === null || fee <= 0) {
      errors.push({
        row: rowNumber,
        message: `"${HEADER_TUITION_FEE}" không hợp lệ (phải là số dương).`,
      });
      return;
    }

    if (parentEmailRaw && !EMAIL_REGEX.test(parentEmailRaw)) {
      errors.push({ row: rowNumber, message: `"${HEADER_PARENT_EMAIL}" không đúng định dạng email.` });
      return;
    }

    if (parentPhoneRaw && !PHONE_REGEX.test(parentPhoneRaw)) {
      errors.push({ row: rowNumber, message: `"${HEADER_PARENT_PHONE}" không đúng định dạng số điện thoại.` });
      return;
    }

    rows.push({
      row: rowNumber,
      fullName,
      className: className || null,
      parentEmail: parentEmailRaw || null,
      parentPhone: parentPhoneRaw || null,
      monthlyTuitionFee: fee,
    });
  });

  return { rows, errors };
}

// ---------------------------------------------------------------------------
// Export builders
// ---------------------------------------------------------------------------

export interface StudentExportRow {
  fullName: string;
  className: string;
  parentEmail: string | null;
  parentPhone: string | null;
  monthlyTuitionFee: number;
  active: boolean;
}

export function buildStudentsExportWorkbook(students: StudentExportRow[]): Buffer {
  const data = students.map((s) => ({
    [HEADER_FULL_NAME]: s.fullName,
    [HEADER_CLASS]: s.className,
    [HEADER_PARENT_EMAIL]: s.parentEmail ?? "",
    [HEADER_PARENT_PHONE]: s.parentPhone ?? "",
    [HEADER_TUITION_FEE]: s.monthlyTuitionFee,
    "Trạng thái": s.active ? "Đang học" : "Ngừng học",
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  worksheet["!cols"] = [{ wch: 24 }, { wch: 16 }, { wch: 26 }, { wch: 16 }, { wch: 14 }, { wch: 12 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Học sinh");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

export interface TuitionSummaryExportRow {
  fullName: string;
  className: string;
  monthlyTuitionFee: number;
  payments: { month: number; isPaid: boolean; amount: number }[];
}

export function buildTuitionSummaryExportWorkbook(
  year: number,
  students: TuitionSummaryExportRow[]
): Buffer {
  const monthHeaders = Array.from({ length: 12 }, (_, i) => `T${i + 1}`);

  const data = students.map((s) => {
    const row: Record<string, unknown> = {
      [HEADER_FULL_NAME]: s.fullName,
      [HEADER_CLASS]: s.className,
      [HEADER_TUITION_FEE]: s.monthlyTuitionFee,
    };
    for (const monthHeader of monthHeaders) {
      const monthNum = Number(monthHeader.slice(1));
      const payment = s.payments.find((p) => p.month === monthNum);
      row[monthHeader] = payment?.isPaid ? "Đã đóng" : "Chưa đóng";
    }
    const totalCollected = s.payments.filter((p) => p.isPaid).reduce((sum, p) => sum + p.amount, 0);
    row["Tổng đã thu"] = totalCollected;
    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(data);
  worksheet["!cols"] = [
    { wch: 24 },
    { wch: 16 },
    { wch: 14 },
    ...monthHeaders.map(() => ({ wch: 10 })),
    { wch: 14 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, `Tổng hợp học phí ${year}`);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

export interface OverdueExportRow {
  studentName: string;
  className: string;
  month: number;
  daysLate: number;
  amount: number;
  severity: "orange" | "red";
}

export function buildOverdueExportWorkbook(rows: OverdueExportRow[]): Buffer {
  const data = rows.map((r) => ({
    "Học sinh": r.studentName,
    [HEADER_CLASS]: r.className,
    Tháng: r.month,
    "Số ngày trễ": r.daysLate,
    "Số tiền": r.amount,
    "Mức độ": r.severity === "red" ? "Nghiêm trọng" : "Cảnh báo",
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  worksheet["!cols"] = [{ wch: 24 }, { wch: 16 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Danh sách quá hạn");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

export default {
  parseStudentsImportFile,
  buildStudentsExportWorkbook,
  buildTuitionSummaryExportWorkbook,
  buildOverdueExportWorkbook,
};
