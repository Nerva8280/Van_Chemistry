import api from './api';
import { ExamData } from '../exam/types';

export interface ExamSummary {
  id: string;
  title: string;
  sourceName: string | null;
  versionCount: number;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExamFull extends ExamSummary {
  data: ExamData;
}

export const examService = {
  async list(): Promise<{ exams: ExamSummary[]; totalBytes: number }> {
    const { data } = await api.get('/exams');
    return data;
  },
  async get(id: string): Promise<ExamFull> {
    const { data } = await api.get(`/exams/${id}`);
    return data;
  },
  async create(payload: { title: string; sourceName?: string; data: ExamData }): Promise<ExamFull> {
    const { data } = await api.post('/exams', payload);
    return data;
  },
  async update(id: string, payload: { title?: string; data?: ExamData }): Promise<ExamFull> {
    const { data } = await api.put(`/exams/${id}`, payload);
    return data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/exams/${id}`);
  },
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
