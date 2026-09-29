import { format, parseISO } from 'date-fns';

const currencyFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
});

export function formatCurrency(value: number | string | null | undefined): string {
  const num = Number(value ?? 0);
  return currencyFormatter.format(Number.isFinite(num) ? num : 0);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  try {
    const date = typeof value === 'string' ? parseISO(value) : value;
    return format(date, 'dd/MM/yyyy');
  } catch {
    return '';
  }
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  const num = Number(value ?? 0);
  return `${num.toFixed(digits)}%`;
}

export const MONTH_LABELS = [
  'T1',
  'T2',
  'T3',
  'T4',
  'T5',
  'T6',
  'T7',
  'T8',
  'T9',
  'T10',
  'T11',
  'T12',
];
