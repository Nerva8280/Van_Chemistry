import api from './api';
import { DashboardResponse } from '../types';

export interface DashboardParams {
  year?: number;
  month?: number;
  classId?: string;
}

export const dashboardService = {
  async get(params: DashboardParams = {}): Promise<DashboardResponse> {
    const res = await api.get<DashboardResponse>('/dashboard', {
      params: {
        year: params.year || undefined,
        month: params.month || undefined,
        classId: params.classId || undefined,
      },
    });
    return res.data;
  },
};
