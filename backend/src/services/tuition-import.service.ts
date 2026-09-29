import * as XLSX from "xlsx";
import prisma from "../config/db";

/*
 * Wide-format tuition workbook, one worksheet per source sheet:
 *   STT | Tên học sinh | Lớp (optional) | Học phí dự kiến (optional) | <period columns...> | Tổng ... (optional)
 * Period column header: "Tháng 7 (15/6-14/7)" or "Kỳ 1 (30/6-4/8)".
 * Cell: empty / "—" = not enrolled in that period; a number (including 0) = amount paid.
 * A row whose STT or name starts with "Tổng" holds hand-written totals to cross-check.
 */

export type WarningType =
  | "missing_header"
  | "invalid_period"
  | "duplicate_stt"
  | "duplicate_name"
  | "similar_name"
  | "unusual_name"
  | "total_mismatch"
  | "total_match"
  | "total_unassigned"
  | "zero_value"
  | "blank_cell"
  | "partial_payment"
  | "overpaid"
  | "invalid_value"
  | "stray_row";

export interface ImportWarning {
  type: WarningType;
  sheet: string;
  row?: number;
  message: string;
}

export interface ImportOptions {
  year: number;
  unit: number;
}

interface ParsedPeriod {
  col: number;
  header: string;
  name: string;
  year: number;
  month: number;
  startDate: Date | null;
  endDate: Date | null;
  dueDate: Date | null;
}

interface ParsedStudent {
  sheet: string;
  row: number;
  stt: number | null;
  fullName: string;
  className: string;
  explicitFee: number | null;
  cells: { month: number; amount: number | null }[];
}

interface ClassPlan {
  name: string;
  defaultFee: number;
  periods: ParsedPeriod[];
  students: (ParsedStudent & { fee: number })[];
}

export interface ImportPreview {
  year: number;
  unit: number;
  classes: {
    name: string;
    exists: boolean;
    defaultFee: number;
    studentCount: number;
    periods: {
      name: string;
      header: string;
      year: number;
      month: number;
      startDate: Date | null;
      endDate: Date | null;
      dueDate: Date | null;
      enrolled: number;
      paid: number;
      partial: number;
      unpaid: number;
      collected: number;
    }[];
  }[];
  totals: { sheet: string; label: string; computed: number; manual: number | null; match: boolean | null }[];
  studentCount: number;
  paymentCount: number;
  warnings: ImportWarning[];
}

const DASHES = new Set(["", "—", "–", "-", "--"]);

function text(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/\s+/g, " ").trim();
}

export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function parseAmount(v: unknown): { ok: true; value: number | null } | { ok: false } {
  if (typeof v === "number") return Number.isFinite(v) ? { ok: true, value: v } : { ok: false };
  const s = text(v);
  if (DASHES.has(s)) return { ok: true, value: null };
  const cleaned = s.replace(/[₫đĐ]|vnd/gi, "").replace(/[.,\s]/g, "");
  if (!/^\d+$/.test(cleaned)) return { ok: false };
  return { ok: true, value: Number(cleaned) };
}

function validDate(y: number, m: number, d: number): Date | null {
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

/** Month containing most days of [start, end]; used for periods not named "Tháng N". */
function dominantMonth(start: Date, end: Date): { year: number; month: number } {
  const counts = new Map<string, number>();
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const k = `${d.getFullYear()}-${d.getMonth() + 1}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [y, m] = best[0].split("-").map(Number);
  return { year: y, month: m };
}

const HEADER_RE = /^(.*?)\s*\(\s*(\d{1,2})\/(\d{1,2})\s*(?:-|–|—|đến)\s*(\d{1,2})\/(\d{1,2})\s*\)\s*$/i;

function parsePeriodHeader(header: string, col: number, year: number): ParsedPeriod | string {
  const m = header.match(HEADER_RE);
  const monthFromName = (name: string) => {
    const mm = normalizeName(name).match(/^thang\s*(\d{1,2})$/);
    const n = mm ? Number(mm[1]) : NaN;
    return n >= 1 && n <= 12 ? n : null;
  };

  if (!m) {
    const month = monthFromName(header);
    if (month === null) {
      return `Cột "${header}" không rõ là kỳ học phí nào (cần dạng "Tháng 7 (15/6-14/7)").`;
    }
    return { col, header, name: header, year, month, startDate: null, endDate: null, dueDate: null };
  }

  const name = m[1].trim() || header;
  const [d1, m1, d2, m2] = m.slice(2).map(Number);
  const start = validDate(year, m1, d1);
  const end = validDate(m2 < m1 ? year + 1 : year, m2, d2);
  if (!start || !end) return `Cột "${header}" có ngày không hợp lệ.`;
  if (start > end) return `Cột "${header}" có ngày bắt đầu sau ngày kết thúc.`;

  const named = monthFromName(name);
  let placed: { year: number; month: number };
  if (named !== null) {
    const y =
      end.getMonth() + 1 === named ? end.getFullYear() : start.getMonth() + 1 === named ? start.getFullYear() : year;
    placed = { year: y, month: named };
  } else {
    placed = dominantMonth(start, end);
  }
  return { col, header, name, year: placed.year, month: placed.month, startDate: start, endDate: end, dueDate: null };
}

function mode(values: number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = 0;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount || (c === bestCount && v > best)) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

const NEEDS_DIACRITICS = new Set([
  "hoang", "nguyen", "pham", "nhat", "tran", "le", "vu", "vo", "dang", "dung", "duong", "thu",
  "thuy", "quan", "quoc", "phuong", "truong", "ngoc", "bao", "tuan", "viet", "trung", "thanh", "phuc",
]);

function unusualNameReasons(name: string): string[] {
  const reasons: string[] = [];
  const words = name.split(" ");
  if (words.some((w) => /^\p{Ll}/u.test(w))) reasons.push("có chữ cái đầu viết thường");
  const ascii = words.filter((w) => normalizeName(w) === w.toLowerCase());
  if (ascii.some((w) => NEEDS_DIACRITICS.has(w.toLowerCase()))) reasons.push("có vẻ thiếu dấu tiếng Việt");
  const norm = normalizeName(name).split(" ");
  if (norm.some((w) => /([a-z])\1/.test(w))) reasons.push("có chữ cái bị lặp (có thể gõ nhầm)");
  if (norm.some((w) => w.length >= 8)) reasons.push("có từ rất dài (có thể bị viết liền)");
  const lower = words.map((w) => w.toLowerCase());
  if (lower.some((w, i) => i > 0 && w === lower[i - 1])) reasons.push("có từ lặp lại liền nhau");
  if (words.length === 1) reasons.push("chỉ có một từ");
  return reasons;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(n);
}

export function parseTuitionWorkbook(buffer: Buffer, opts: ImportOptions) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const warnings: ImportWarning[] = [];
  const students: ParsedStudent[] = [];
  const sheetPeriods = new Map<string, ParsedPeriod[]>();
  const totals: ImportPreview["totals"] = [];

  for (const sheetName of workbook.SheetNames) {
    const grid: unknown[][] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    });

    const headerIdx = grid.findIndex((r) => r.some((c) => normalizeName(text(c)) === "ten hoc sinh"));
    if (headerIdx < 0) {
      if (grid.some((r) => r.some((c) => text(c)))) {
        warnings.push({ type: "missing_header", sheet: sheetName, message: 'Không tìm thấy dòng tiêu đề có cột "Tên học sinh". Sheet này bị bỏ qua.' });
      }
      continue;
    }
    const header = grid[headerIdx].map(text);
    const col = (pred: (h: string) => boolean) => header.findIndex((h) => pred(normalizeName(h)));
    const cStt = col((h) => h === "stt");
    const cName = col((h) => h === "ten hoc sinh");
    const cClass = col((h) => h === "lop");
    const cFee = col((h) => h.startsWith("hoc phi du kien"));
    const cUnassigned = col((h) => h.startsWith("tong"));
    const reserved = new Set([cStt, cName, cClass, cFee, cUnassigned]);

    const periods: ParsedPeriod[] = [];
    header.forEach((h, i) => {
      if (reserved.has(i) || !h) return;
      const parsed = parsePeriodHeader(h, i, opts.year);
      if (typeof parsed === "string") {
        warnings.push({ type: "invalid_period", sheet: sheetName, row: headerIdx + 1, message: parsed + " Cột này bị bỏ qua." });
      } else if (periods.some((p) => p.month === parsed.month && p.year === parsed.year)) {
        warnings.push({ type: "invalid_period", sheet: sheetName, row: headerIdx + 1, message: `Cột "${h}" trùng tháng ${parsed.month}/${parsed.year} với một cột khác. Cột này bị bỏ qua.` });
      } else {
        periods.push(parsed);
      }
    });
    sheetPeriods.set(sheetName, periods);

    const computed = new Map<number, number>(periods.map((p) => [p.col, 0]));
    const manual = new Map<number, number>();
    let unassignedManual: number | null = null;
    const seenStt = new Map<number, number>();

    for (let r = headerIdx + 1; r < grid.length; r++) {
      const row = grid[r];
      const excelRow = r + 1;
      const name = text(row[cName]);
      const sttText = cStt >= 0 ? text(row[cStt]) : "";

      if (/^tong/.test(normalizeName(name)) || /^tong/.test(normalizeName(sttText))) {
        for (const p of periods) {
          const a = parseAmount(row[p.col]);
          if (a.ok && a.value !== null) manual.set(p.col, a.value);
        }
        if (cUnassigned >= 0) {
          const a = parseAmount(row[cUnassigned]);
          if (a.ok && a.value !== null) unassignedManual = a.value;
        }
        continue;
      }

      if (!name) {
        const leftovers = row.map(text).filter((v) => v);
        if (leftovers.length) {
          warnings.push({ type: "stray_row", sheet: sheetName, row: excelRow, message: `Dòng không có tên học sinh nên bị bỏ qua: "${leftovers.join(" | ")}".` });
        }
        continue;
      }

      let stt: number | null = null;
      if (sttText) {
        const n = Number(sttText);
        stt = Number.isInteger(n) ? n : null;
        if (stt !== null) {
          const prev = seenStt.get(stt);
          if (prev !== undefined) {
            warnings.push({ type: "duplicate_stt", sheet: sheetName, row: excelRow, message: `STT ${stt} bị trùng (đã có ở dòng ${prev}).` });
          } else {
            seenStt.set(stt, excelRow);
          }
        }
      }

      let explicitFee: number | null = null;
      if (cFee >= 0) {
        const a = parseAmount(row[cFee]);
        if (a.ok && a.value) explicitFee = a.value * opts.unit;
      }

      const cells: ParsedStudent["cells"] = [];
      const zeros: string[] = [];
      const blanks: string[] = [];
      for (const p of periods) {
        const a = parseAmount(row[p.col]);
        if (!a.ok) {
          warnings.push({ type: "invalid_value", sheet: sheetName, row: excelRow, message: `${name}: giá trị "${text(row[p.col])}" ở cột "${p.header}" không phải số, được coi như ô trống.` });
          cells.push({ month: p.month, amount: null });
          blanks.push(p.name);
          continue;
        }
        if (a.value === null) blanks.push(p.name);
        else {
          if (a.value === 0) zeros.push(p.name);
          computed.set(p.col, computed.get(p.col)! + a.value);
        }
        cells.push({ month: p.month, amount: a.value === null ? null : a.value * opts.unit });
      }
      if (zeros.length) warnings.push({ type: "zero_value", sheet: sheetName, row: excelRow, message: `${name}: giá trị 0 (có học, chưa đóng) ở ${zeros.join(", ")}.` });
      if (blanks.length) warnings.push({ type: "blank_cell", sheet: sheetName, row: excelRow, message: `${name}: ô trống (không học kỳ đó) ở ${blanks.join(", ")}.` });

      students.push({
        sheet: sheetName,
        row: excelRow,
        stt,
        fullName: name,
        className: cClass >= 0 && text(row[cClass]) ? text(row[cClass]) : sheetName,
        explicitFee,
        cells,
      });
    }

    for (const p of periods) {
      const c = computed.get(p.col)!;
      const m = manual.has(p.col) ? manual.get(p.col)! : null;
      totals.push({ sheet: sheetName, label: p.header, computed: c * opts.unit, manual: m === null ? null : m * opts.unit, match: m === null ? null : m === c });
      if (m !== null) {
        warnings.push(
          m === c
            ? { type: "total_match", sheet: sheetName, message: `Tổng ghi tay của "${p.header}" (${fmt(m)}) khớp với tổng hệ thống tính.` }
            : { type: "total_mismatch", sheet: sheetName, message: `Tổng ghi tay của "${p.header}" là ${fmt(m)}, khác tổng hệ thống tính là ${fmt(c)} (chênh ${fmt(Math.abs(m - c))}).` }
        );
      }
    }
    if (unassignedManual !== null) {
      const all = [...computed.values()].reduce((s, v) => s + v, 0);
      const matches = periods.filter((p) => computed.get(p.col) === unassignedManual).map((p) => `"${p.header}"`);
      const parts = [`tổng cả sheet là ${fmt(all)}${all === unassignedManual ? " (khớp)" : ""}`];
      if (matches.length) parts.push(`trùng khớp với tổng của ${matches.join(", ")}`);
      else parts.push("không trùng với tổng của kỳ nào");
      totals.push({ sheet: sheetName, label: "Tổng ghi tay (chưa rõ kỳ)", computed: all * opts.unit, manual: unassignedManual * opts.unit, match: null });
      warnings.push({ type: "total_unassigned", sheet: sheetName, message: `Tổng ghi tay ${fmt(unassignedManual)} chưa rõ thuộc kỳ nào: ${parts.join("; ")}. Hệ thống không tự gán số này cho kỳ nào.` });
    }
  }

  return { students, sheetPeriods, totals, warnings };
}

/** "Hoàng Nam" ⊂ "Hoàng Nhật Nam": every word of the shorter name appears, in order, in the longer one. */
function isSubsequence(short: string[], long: string[]): boolean {
  let i = 0;
  for (const w of long) if (i < short.length && w === short[i]) i++;
  return i === short.length;
}

function buildPlan(parsed: ReturnType<typeof parseTuitionWorkbook>) {
  const { students, sheetPeriods, warnings } = parsed;
  const byClass = new Map<string, ParsedStudent[]>();
  for (const s of students) {
    const list = byClass.get(s.className) ?? [];
    list.push(s);
    byClass.set(s.className, list);
  }

  const plans: ClassPlan[] = [];
  for (const [className, list] of byClass) {
    const periodsByMonth = new Map<string, ParsedPeriod>();
    for (const s of list) {
      for (const p of sheetPeriods.get(s.sheet) ?? []) periodsByMonth.set(`${p.year}-${p.month}`, p);
    }
    const explicit = list.map((s) => s.explicitFee).filter((v): v is number => v !== null);
    const positives = list.flatMap((s) => s.cells.map((c) => c.amount).filter((a): a is number => a !== null && a > 0));
    const defaultFee = mode(explicit.length ? explicit : positives);

    const withFee = list.map((s) => ({ ...s, fee: s.explicitFee ?? defaultFee }));
    for (const s of withFee) {
      for (const c of s.cells) {
        if (c.amount === null || c.amount === 0) continue;
        const p = (sheetPeriods.get(s.sheet) ?? []).find((x) => x.month === c.month)!;
        if (c.amount < s.fee) {
          warnings.push({ type: "partial_payment", sheet: s.sheet, row: s.row, message: `${s.fullName}: ${p.name} đóng ${fmt(c.amount)}đ, ít hơn mức dự kiến ${fmt(s.fee)}đ. Ghi nhận "Đóng một phần".` });
        } else if (c.amount > s.fee) {
          warnings.push({ type: "overpaid", sheet: s.sheet, row: s.row, message: `${s.fullName}: ${p.name} đóng ${fmt(c.amount)}đ, nhiều hơn mức dự kiến ${fmt(s.fee)}đ.` });
        }
      }
    }
    plans.push({
      name: className,
      defaultFee,
      periods: [...periodsByMonth.values()].sort((a, b) => a.year - b.year || a.month - b.month),
      students: withFee,
    });
  }

  const all = plans.flatMap((c) => c.students.map((s) => ({ s, cls: c.name, tokens: normalizeName(s.fullName).split(" ") })));
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      const same = a.tokens.join(" ") === b.tokens.join(" ");
      if (same && a.cls === b.cls) {
        warnings.push({ type: "duplicate_name", sheet: b.s.sheet, row: b.s.row, message: `Tên "${b.s.fullName}" bị trùng trong lớp ${b.cls} (dòng ${a.s.row} và ${b.s.row}).` });
        continue;
      }
      const [short, long] = a.tokens.length <= b.tokens.length ? [a, b] : [b, a];
      if (same || isSubsequence(short.tokens, long.tokens)) {
        warnings.push({
          type: "similar_name",
          sheet: short.s.sheet,
          row: short.s.row,
          message: `"${short.s.fullName}" (${short.cls}) và "${long.s.fullName}" (${long.cls}) có thể là cùng một học sinh. Hệ thống vẫn lưu thành 2 học sinh riêng.`,
        });
      }
    }
  }
  for (const { s } of all) {
    const reasons = unusualNameReasons(s.fullName);
    if (reasons.length) {
      warnings.push({ type: "unusual_name", sheet: s.sheet, row: s.row, message: `Tên "${s.fullName}" ${reasons.join(", ")}. Tên vẫn được giữ nguyên.` });
    }
  }
  return plans;
}

function classStats(plan: ClassPlan) {
  return plan.periods.map((p) => {
    let enrolled = 0, paid = 0, partial = 0, unpaid = 0, collected = 0;
    for (const s of plan.students) {
      const c = s.cells.find((x) => x.month === p.month);
      if (!c || c.amount === null) continue;
      enrolled++;
      collected += c.amount;
      if (c.amount >= s.fee) paid++;
      else if (c.amount > 0) partial++;
      else unpaid++;
    }
    return {
      name: p.name,
      header: p.header,
      year: p.year,
      month: p.month,
      startDate: p.startDate,
      endDate: p.endDate,
      dueDate: p.dueDate,
      enrolled,
      paid,
      partial,
      unpaid,
      collected,
    };
  });
}

export async function previewTuitionImport(userId: string, buffer: Buffer, opts: ImportOptions) {
  const parsed = parseTuitionWorkbook(buffer, opts);
  const plans = buildPlan(parsed);
  const existing = await prisma.class.findMany({ where: { userId }, select: { name: true } });
  const existingNames = new Set(existing.map((c) => c.name));

  const preview: ImportPreview = {
    year: opts.year,
    unit: opts.unit,
    classes: plans.map((p) => ({
      name: p.name,
      exists: existingNames.has(p.name),
      defaultFee: p.defaultFee,
      studentCount: p.students.length,
      periods: classStats(p),
    })),
    totals: parsed.totals,
    studentCount: parsed.students.length,
    paymentCount: parsed.students.reduce((s, st) => s + st.cells.filter((c) => c.amount !== null).length, 0),
    warnings: parsed.warnings,
  };
  return { preview, plans };
}

/** Idempotent: classes/periods/students are matched by name, so re-importing updates amounts instead of duplicating. */
export async function commitTuitionImport(userId: string, plans: ClassPlan[]) {
  let classesCreated = 0, studentsCreated = 0, studentsUpdated = 0, payments = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const plan of plans) {
        let cls = await tx.class.findFirst({ where: { userId, name: plan.name } });
        if (!cls) {
          cls = await tx.class.create({
            data: { userId, name: plan.name, defaultTuitionFee: plan.defaultFee },
          });
          classesCreated++;
        }

        const periodIds = new Map<string, string>();
        for (const p of plan.periods) {
          // Re-imports must not wipe a due date the teacher has set since.
          const data = { name: p.name, startDate: p.startDate, endDate: p.endDate };
          const saved = await tx.tuitionPeriod.upsert({
            where: { classId_year_month: { classId: cls.id, year: p.year, month: p.month } },
            create: { classId: cls.id, year: p.year, month: p.month, ...data, dueDate: p.dueDate },
            update: data,
          });
          periodIds.set(`${p.year}-${p.month}`, saved.id);
        }

        for (const s of plan.students) {
          let student = await tx.student.findFirst({ where: { classId: cls.id, fullName: s.fullName } });
          if (!student) {
            student = await tx.student.create({
              data: { classId: cls.id, fullName: s.fullName, stt: s.stt, monthlyTuitionFee: s.fee },
            });
            studentsCreated++;
          } else {
            student = await tx.student.update({ where: { id: student.id }, data: { stt: s.stt, monthlyTuitionFee: s.fee } });
            studentsUpdated++;
          }

          for (const c of s.cells) {
            if (c.amount === null) continue;
            const period = plan.periods.find((p) => p.month === c.month)!;
            const periodId = periodIds.get(`${period.year}-${period.month}`)!;
            const data = {
              expectedAmount: s.fee,
              paidAmount: c.amount,
              isPaid: c.amount >= s.fee,
              paidDate: null,
              note: "Nhập từ file Excel",
            };
            await tx.tuitionPayment.upsert({
              where: { studentId_periodId: { studentId: student.id, periodId } },
              create: { studentId: student.id, periodId, ...data },
              update: data,
            });
            payments++;
          }
        }
      }
    },
    { timeout: 120_000, maxWait: 20_000 }
  );

  return { classesCreated, studentsCreated, studentsUpdated, payments };
}

export function buildTuitionTemplate(): Buffer {
  const rows = [
    ["STT", "Tên học sinh", "Lớp", "Học phí dự kiến", "Tháng 7 (15/6-14/7)", "Tháng 8 (15/7-14/8)"],
    [1, "Nguyễn Văn A", "Lớp 12.1", 500, 500, 500],
    [2, "Trần Thị B", "Lớp 12.1", 500, 250, null],
    [3, "Lê Văn C", "Lớp 12.1", 500, 0, 500],
    ["Tổng", null, null, null, 750, 1000],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 6 }, { wch: 24 }, { wch: 12 }, { wch: 16 }, { wch: 22 }, { wch: 22 }];
  const guide = XLSX.utils.aoa_to_sheet([
    ["Hướng dẫn"],
    ["- Mỗi sheet là một nguồn dữ liệu. Cột bắt buộc: \"Tên học sinh\" và các cột kỳ học phí."],
    ["- Cột kỳ học phí ghi dạng: Tháng 7 (15/6-14/7) hoặc Kỳ 1 (30/6-4/8)."],
    ["- Ô để trống hoặc ghi \"—\": học sinh không học kỳ đó. Số 0: có học nhưng chưa đóng."],
    ["- Cột \"Lớp\" không bắt buộc (nếu bỏ trống, tên sheet được dùng làm tên lớp)."],
    ["- Cột \"Học phí dự kiến\" không bắt buộc (nếu bỏ trống, lấy mức đóng phổ biến nhất của lớp)."],
    ["- Dòng có STT là \"Tổng\" dùng để đối chiếu với tổng hệ thống tự tính."],
  ]);
  guide["!cols"] = [{ wch: 100 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Mẫu");
  XLSX.utils.book_append_sheet(wb, guide, "Hướng dẫn");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
