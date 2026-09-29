import { format, parseISO } from 'date-fns';

const currencyFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
});

const numberFormatter = new Intl.NumberFormat('vi-VN');

/** 500000 -> "500.000 ₫" */
export function formatCurrency(value: number | string | null | undefined): string {
  const num = Number(value ?? 0);
  return currencyFormatter.format(Number.isFinite(num) ? num : 0);
}

/** 500000 -> "500.000" (không có ký hiệu tiền; dùng trong ô bảng cho gọn). */
export function formatNumber(value: number | string | null | undefined): string {
  const num = Number(value ?? 0);
  return numberFormatter.format(Number.isFinite(num) ? num : 0);
}

/** Rút gọn cho trục biểu đồ: 5000000 -> "5 tr", 1500000000 -> "1,5 tỷ". */
export function formatCompactCurrency(value: number): string {
  const abs = Math.abs(value);
  const fmt = (n: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(n);
  if (abs >= 1_000_000_000) return `${fmt(value / 1_000_000_000)} tỷ`;
  if (abs >= 1_000_000) return `${fmt(value / 1_000_000)} tr`;
  if (abs >= 1_000) return `${fmt(value / 1_000)} nghìn`;
  return fmt(value);
}

function toDate(value: string | Date): Date {
  return typeof value === 'string' ? parseISO(value) : value;
}

/** dd/MM/yyyy; chuỗi rỗng khi không có ngày. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  try {
    const d = toDate(value);
    if (Number.isNaN(d.getTime())) return '';
    return format(d, 'dd/MM/yyyy');
  } catch {
    return '';
  }
}

/** Khoảng ngày ngắn gọn cho tiêu đề cột: "15/6-14/7". */
export function formatShortRange(start: string | null | undefined, end: string | null | undefined): string {
  const f = (v: string) => {
    const d = parseISO(v);
    return Number.isNaN(d.getTime()) ? '' : format(d, 'd/M');
  };
  if (start && end) return `${f(start)}-${f(end)}`;
  if (start) return `từ ${f(start)}`;
  if (end) return `đến ${f(end)}`;
  return '';
}

/** Khoảng ngày đầy đủ: "15/06/2026 - 14/07/2026". */
export function formatDateRange(start: string | null | undefined, end: string | null | undefined): string {
  if (start && end) return `${formatDate(start)} - ${formatDate(end)}`;
  if (start) return `từ ${formatDate(start)}`;
  if (end) return `đến ${formatDate(end)}`;
  return '';
}

/** Giá trị cho <input type="date"> (yyyy-MM-dd) theo giờ địa phương. */
export function toDateInput(value: string | null | undefined): string {
  if (!value) return '';
  try {
    const d = parseISO(value);
    if (Number.isNaN(d.getTime())) return '';
    return format(d, 'yyyy-MM-dd');
  } catch {
    return '';
  }
}

/**
 * Tỷ lệ phần trăm. QUY ƯỚC: truyền vào tỷ lệ 0..1 (như API trả về), hàm tự nhân 100.
 * 0.8 -> "80%"; 0.853 -> "85,3%".
 */
export function formatPercent(ratio: number | null | undefined, digits = 1): string {
  const num = Number(ratio ?? 0) * 100;
  const safe = Number.isFinite(num) ? num : 0;
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits }).format(safe)}%`;
}

export function monthLabel(month: number): string {
  return `Tháng ${month}`;
}
