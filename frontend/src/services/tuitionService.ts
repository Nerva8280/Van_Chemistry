import api from './api';
import { TuitionGridResponse, TuitionPayment } from '../types';

export const tuitionService = {
  async grid(year: number, classId?: string): Promise<TuitionGridResponse> {
    const res = await api.get<TuitionGridResponse>('/tuition', {
      params: { year, classId: classId || undefined },
    });
    return res.data;
  },

  async setPaid(studentId: string, year: number, month: number, isPaid: boolean): Promise<TuitionPayment> {
    const res = await api.put<TuitionPayment>(`/tuition/${studentId}/${year}/${month}`, { isPaid });
    return res.data;
  },
};
