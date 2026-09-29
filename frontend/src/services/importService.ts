import api from './api';
import { TuitionImportResponse } from '../types';
import { downloadBlob } from './studentService';

export type MoneyUnit = 1 | 1000;

async function send(file: File, year: number, unit: MoneyUnit, commit: boolean): Promise<TuitionImportResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('year', String(year));
  formData.append('unit', String(unit));
  formData.append('commit', commit ? 'true' : 'false');
  const res = await api.post<TuitionImportResponse>('/import/tuition', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export const importService = {
  preview(file: File, year: number, unit: MoneyUnit): Promise<TuitionImportResponse> {
    return send(file, year, unit, false);
  },

  commit(file: File, year: number, unit: MoneyUnit): Promise<TuitionImportResponse> {
    return send(file, year, unit, true);
  },

  async downloadTemplate(): Promise<void> {
    const res = await api.get('/import/tuition/template', { responseType: 'blob' });
    downloadBlob(res.data, 'mau-nhap-hoc-phi.xlsx');
  },
};
