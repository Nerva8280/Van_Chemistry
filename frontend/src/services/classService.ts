import api from './api';
import { Class } from '../types';

export interface ClassPayload {
  name: string;
  defaultTuitionFee: number;
}

export const classService = {
  async list(): Promise<Class[]> {
    const res = await api.get<Class[]>('/classes');
    return res.data;
  },

  async create(payload: ClassPayload): Promise<Class> {
    const res = await api.post<Class>('/classes', payload);
    return res.data;
  },

  async update(id: string, payload: Partial<ClassPayload>): Promise<Class> {
    const res = await api.put<Class>(`/classes/${id}`, payload);
    return res.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/classes/${id}`);
  },
};
