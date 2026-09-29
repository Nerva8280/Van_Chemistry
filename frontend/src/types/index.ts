// Shared TypeScript interfaces matching CONTRACT.md response shapes.

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  provider: string;
  providerId: string;
  createdAt: string;
}

export interface Class {
  id: string;
  name: string;
  defaultTuitionFee: number;
  userId: string;
  studentCount: number;
  createdAt: string;
}

export interface Student {
  id: string;
  fullName: string;
  classId: string;
  class?: Class;
  parentEmail?: string | null;
  parentPhone?: string | null;
  monthlyTuitionFee: number;
  active: boolean;
  createdAt: string;
}

export interface TuitionPayment {
  id: string;
  studentId: string;
  year: number;
  month: number;
  isPaid: boolean;
  paidDate?: string | null;
  amount: number;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface TuitionGridPayment {
  month: number; // 1-12
  isPaid: boolean;
  paidDate: string | null;
  dueDate: string;
}

export interface TuitionGridStudent {
  id: string;
  fullName: string;
  className: string;
  monthlyTuitionFee: number;
  payments: TuitionGridPayment[];
}

export interface TuitionGridResponse {
  students: TuitionGridStudent[];
}

export interface DashboardSummary {
  totalClasses: number;
  totalStudents: number;
  totalExpected: number;
  totalCollected: number;
  totalOutstanding: number;
  completionRate: number;
  overdueStudentCount: number;
}

export interface MonthlyRevenuePoint {
  month: number;
  expected: number;
  collected: number;
}

export interface ClassCollectionRatePoint {
  className: string;
  rate: number;
}

export interface PaidVsUnpaid {
  paid: number;
  unpaid: number;
}

export interface RevenueTrendPoint {
  month: number;
  revenue: number;
}

export interface DashboardCharts {
  monthlyRevenue: MonthlyRevenuePoint[];
  classCollectionRate: ClassCollectionRatePoint[];
  paidVsUnpaid: PaidVsUnpaid;
  revenueTrend: RevenueTrendPoint[];
}

export type OverdueSeverity = 'orange' | 'red';

export interface OverdueRow {
  studentName: string;
  className: string;
  month: number;
  daysLate: number;
  amount: number;
  severity: OverdueSeverity;
}

export interface ImportError {
  row: number;
  message: string;
}

export interface ImportResult {
  imported: number;
  errors: ImportError[];
}

export interface ApiErrorResponse {
  error: string;
}
