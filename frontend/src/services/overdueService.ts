import api from './api';
import { OverdueRow } from '../types';

export const overdueService = {
  async list(year: number): Promise<OverdueRow[]> {
    const res = await api.get<OverdueRow[]>('/overdue', { params: { year } });
    return res.data;
  },
};
