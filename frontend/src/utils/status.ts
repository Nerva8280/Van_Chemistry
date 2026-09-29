import { PaymentStatus } from '../types';

export const STATUS_ORDER: PaymentStatus[] = ['paid', 'partial', 'overdue', 'unpaid'];

export const STATUS_LABEL: Record<PaymentStatus, string> = {
  paid: 'Đã đóng',
  partial: 'Đóng một phần',
  overdue: 'Quá hạn',
  unpaid: 'Chưa đóng',
};

/** Màu gốc cho biểu đồ / chấm chú thích. */
export const STATUS_COLOR: Record<PaymentStatus, string> = {
  paid: '#0ca30c',
  partial: '#fab219',
  overdue: '#d03b3b',
  unpaid: '#94a3b8',
};

/** Nền + chữ cho ô bảng học phí (chữ đủ tương phản). */
export const STATUS_CELL_CLASS: Record<PaymentStatus, string> = {
  paid: 'bg-success-50 text-success-700',
  partial: 'bg-warning-50 text-warning-700',
  overdue: 'bg-danger-50 text-danger-600',
  unpaid: 'bg-slate-100 text-slate-600',
};

export const STATUS_BADGE_COLOR: Record<PaymentStatus, 'green' | 'orange' | 'red' | 'slate'> = {
  paid: 'green',
  partial: 'orange',
  overdue: 'red',
  unpaid: 'slate',
};

export const PRIMARY_COLOR = '#2a78d6';
