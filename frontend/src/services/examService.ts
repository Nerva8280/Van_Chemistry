import api from './api';
import { ExamData } from '../exam/types';
import type { OcrResult } from '../exam/fromImages';

export interface OcrImagePayload {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  /** base64, không có tiền tố data: */
  data: string;
}

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
  /** Đọc ảnh chụp đề bằng AI (Gemini). Có thể mất 30–60 giây nên chờ tối đa 120 giây. */
  async ocr(images: OcrImagePayload[]): Promise<{ result: OcrResult; model: string }> {
    const { data } = await api.post('/exams/ocr', { images }, { timeout: 120_000 });
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
