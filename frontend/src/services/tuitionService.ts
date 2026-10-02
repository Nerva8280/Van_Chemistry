import api from './api';
import { Payment, PaymentStatus, TuitionGridResponse } from '../types';

export interface TuitionGridParams {
  year?: number;
  quarter?: number;
  classId?: string;
  status?: PaymentStatus;
  /** Chỉ xét trạng thái trong tháng này của trang. */
  statusMonth?: number;
  search?: string;
}

export type PaymentPatch =
  | { isPaid: boolean }
  | {
      paidAmount: number;
      paidDate?: string | null;
      isPaid?: boolean;
      note?: string | null;
      /** yyyy-MM-dd; cả hai null = bỏ kỳ riêng */
      customStartDate?: string | null;
      customEndDate?: string | null;
    }
  | { note: string | null };

export const tuitionService = {
  async grid(params: TuitionGridParams = {}): Promise<TuitionGridResponse> {
    const res = await api.get<TuitionGridResponse>('/tuition', {
      params: {
        year: params.year || undefined,
        quarter: params.quarter || undefined,
        classId: params.classId || undefined,
        status: params.status || undefined,
        statusMonth: (params.status && params.statusMonth) || undefined,
        search: params.search?.trim() || undefined,
      },
    });
    return res.data;
  },

  async updatePayment(id: string, patch: PaymentPatch): Promise<Payment> {
    const res = await api.patch<Payment>(`/tuition/payments/${id}`, patch);
    return res.data;
  },

  async bulkPaid(paymentIds: string[]): Promise<{ updated: Payment[] }> {
    const res = await api.post<{ updated: Payment[] }>('/tuition/payments/bulk-paid', { paymentIds });
    return res.data;
  },

  /** Thêm nhiều học sinh vào kỳ tháng (year, month) của lớp mỗi em. */
  async bulkEnroll(
    studentIds: string[],
    year: number,
    month: number
  ): Promise<{ created: number; alreadyEnrolled: number; noPeriod: string[] }> {
    const res = await api.post('/tuition/payments/bulk-enroll', { studentIds, year, month });
    return res.data;
  },

  /** Bỏ nhiều học sinh khỏi kỳ tháng (year, month); mặc định giữ lại các khoản đã có tiền. */
  async bulkUnenroll(
    studentIds: string[],
    year: number,
    month: number,
    includePaid: boolean
  ): Promise<{ removed: number; keptPaid: number; notEnrolled: number }> {
    const res = await api.post('/tuition/payments/bulk-unenroll', { studentIds, year, month, includePaid });
    return res.data;
  },

  /** Đặt (hoặc bỏ, khi cả hai ngày null) kỳ riêng cho nhiều học sinh trong kỳ tháng (year, month). */
  async bulkCustomPeriod(
    studentIds: string[],
    year: number,
    month: number,
    startDate: string | null,
    endDate: string | null
  ): Promise<{ updated: number; notEnrolled: number }> {
    const res = await api.post('/tuition/payments/bulk-custom-period', { studentIds, year, month, startDate, endDate });
    return res.data;
  },

  async createPayment(studentId: string, periodId: string): Promise<Payment> {
    const res = await api.post<Payment>('/tuition/payments', { studentId, periodId });
    return res.data;
  },

  async deletePayment(id: string): Promise<void> {
    await api.delete(`/tuition/payments/${id}`);
  },
};
