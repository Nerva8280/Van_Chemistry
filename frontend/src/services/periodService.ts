import api from './api';
import { Period } from '../types';

export interface PeriodPayload {
  name: string;
  year: number;
  month: number;
  /** yyyy-MM-dd hoặc null */
  startDate?: string | null;
  endDate?: string | null;
  dueDate?: string | null;
}

export const periodService = {
  async list(classId: string): Promise<Period[]> {
    const res = await api.get<Period[]>(`/classes/${classId}/periods`);
    return res.data;
  },

  async create(classId: string, payload: PeriodPayload): Promise<Period> {
    const res = await api.post<Period>(`/classes/${classId}/periods`, payload);
    return res.data;
  },

  async generate(classId: string, year: number, dueDay?: number): Promise<{ created: number; periods: Period[] }> {
    const res = await api.post<{ created: number; periods: Period[] }>(`/classes/${classId}/periods/generate`, {
      year,
      dueDay,
    });
    return res.data;
  },

  async update(id: string, payload: Partial<PeriodPayload>): Promise<Period> {
    const res = await api.put<Period>(`/periods/${id}`, payload);
    return res.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/periods/${id}`);
  },
};
