import api from './api';
import { OverdueRow } from '../types';
import { downloadBlob } from './studentService';

export const overdueService = {
  async list(year: number): Promise<OverdueRow[]> {
    const res = await api.get<OverdueRow[]>('/overdue', { params: { year } });
    return res.data;
  },

  async exportFile(year: number): Promise<void> {
    const res = await api.get('/reports/overdue/export', { params: { year }, responseType: 'blob' });
    downloadBlob(res.data, `hoc-sinh-qua-han-${year}.xlsx`);
  },
};
