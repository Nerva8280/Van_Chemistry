import api from './api';
import { DashboardCharts, DashboardSummary } from '../types';

export const dashboardService = {
  async summary(year: number): Promise<DashboardSummary> {
    const res = await api.get<DashboardSummary>('/dashboard/summary', { params: { year } });
    return res.data;
  },

  async charts(year: number): Promise<DashboardCharts> {
    const res = await api.get<DashboardCharts>('/dashboard/charts', { params: { year } });
    return res.data;
  },
};
