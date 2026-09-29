import api from './api';
import { Payment, PaymentStatus, TuitionGridResponse } from '../types';

export interface TuitionGridParams {
  year?: number;
  quarter?: number;
  classId?: string;
  status?: PaymentStatus;
  search?: string;
}

export type PaymentPatch =
  | { isPaid: boolean }
  | { paidAmount: number; paidDate?: string | null; isPaid?: boolean; note?: string | null }
  | { note: string | null };

export const tuitionService = {
  async grid(params: TuitionGridParams = {}): Promise<TuitionGridResponse> {
    const res = await api.get<TuitionGridResponse>('/tuition', {
      params: {
        year: params.year || undefined,
        quarter: params.quarter || undefined,
        classId: params.classId || undefined,
        status: params.status || undefined,
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

  async createPayment(studentId: string, periodId: string): Promise<Payment> {
    const res = await api.post<Payment>('/tuition/payments', { studentId, periodId });
    return res.data;
  },

  async deletePayment(id: string): Promise<void> {
    await api.delete(`/tuition/payments/${id}`);
  },
};
