import api from './api';
import { ImportResult, Student } from '../types';

export interface StudentPayload {
  fullName: string;
  classId: string;
  parentEmail?: string;
  parentPhone?: string;
  monthlyTuitionFee: number;
}

export interface StudentListParams {
  classId?: string;
  search?: string;
}

export const studentService = {
  async list(params: StudentListParams = {}): Promise<Student[]> {
    const res = await api.get<Student[]>('/students', {
      params: {
        classId: params.classId || undefined,
        search: params.search || undefined,
      },
    });
    return res.data;
  },

  async create(payload: StudentPayload): Promise<Student> {
    const res = await api.post<Student>('/students', payload);
    return res.data;
  },

  async update(id: string, payload: Partial<StudentPayload>): Promise<Student> {
    const res = await api.put<Student>(`/students/${id}`, payload);
    return res.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/students/${id}`);
  },

  async importFile(file: File, classId?: string): Promise<ImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    if (classId) formData.append('classId', classId);
    const res = await api.post<ImportResult>('/students/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  async exportFile(classId?: string): Promise<void> {
    const res = await api.get('/students/export', {
      params: { classId: classId || undefined },
      responseType: 'blob',
    });
    downloadBlob(res.data, 'danh-sach-hoc-sinh.xlsx');
  },
};

export function downloadBlob(data: BlobPart, filename: string) {
  const blob = new Blob([data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
