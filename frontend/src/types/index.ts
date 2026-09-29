// Shared TypeScript interfaces matching docs/CONTRACT.md (v2) response shapes.

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
  sheetName: string | null;
  defaultTuitionFee: number;
  userId: string;
  createdAt: string;
  studentCount: number;
  periodCount: number;
}

export interface Period {
  id: string;
  classId: string;
  name: string;
  year: number;
  month: number;
  startDate: string | null;
  endDate: string | null;
  /** null = chưa đặt hạn đóng */
  dueDate: string | null;
}

export interface Student {
  id: string;
  stt: number | null;
  fullName: string;
  classId: string;
  class?: Partial<Class> & { id: string; name: string };
  parentEmail?: string | null;
  parentPhone?: string | null;
  /** Học phí dự kiến mỗi kỳ. */
  monthlyTuitionFee: number;
  active: boolean;
  createdAt: string;
}

export type PaymentStatus = 'paid' | 'partial' | 'overdue' | 'unpaid';

export interface Payment {
  id: string;
  studentId: string;
  periodId: string;
  year: number;
  month: number;
  expectedAmount: number;
  paidAmount: number;
  isPaid: boolean;
  paidDate: string | null;
  note: string | null;
  status: PaymentStatus;
  updatedAt: string;
}

export interface TuitionColumn {
  year: number;
  month: number;
}

export interface TuitionGridClass {
  id: string;
  name: string;
  sheetName: string | null;
  periods: Period[];
}

export interface TuitionGridStudent {
  id: string;
  stt: number | null;
  fullName: string;
  classId: string;
  monthlyTuitionFee: number;
  active: boolean;
  payments: Payment[];
}

export interface TuitionGridResponse {
  year: number;
  years: number[];
  sheets: string[];
  columns: TuitionColumn[];
  classes: TuitionGridClass[];
  students: TuitionGridStudent[];
}

export interface DashboardSummary {
  totalClasses: number;
  totalStudents: number;
  totalExpected: number;
  totalCollected: number;
  totalOutstanding: number;
  /** 0..1 */
  completionRate: number;
  averageFeePerStudent: number;
  overdueStudentCount: number;
}

export interface MonthStats {
  paid: number;
  partial: number;
  overdue: number;
  unpaid: number;
}

export interface DashboardMonthPoint {
  month: number;
  label: string;
  expected: number;
  collected: number;
}

export interface DashboardClassPoint {
  className: string;
  expected: number;
  collected: number;
  /** 0..1 */
  rate: number;
}

export interface DashboardUnpaidRow {
  paymentId: string;
  studentId: string;
  studentName: string;
  className: string;
  periodName: string;
  month: number;
  dueDate: string | null;
  expectedAmount: number;
  paidAmount: number;
  remaining: number;
  status: PaymentStatus;
}

export interface DashboardResponse {
  year: number;
  years: number[];
  months: number[];
  selectedMonth: number | null;
  summary: DashboardSummary;
  monthStats: MonthStats;
  byMonth: DashboardMonthPoint[];
  byClass: DashboardClassPoint[];
  unpaidList: DashboardUnpaidRow[];
}

export type OverdueSeverity = 'orange' | 'red';

export interface OverdueRow {
  paymentId: string;
  studentId: string;
  studentName: string;
  className: string;
  periodName: string;
  year: number;
  month: number;
  dueDate: string;
  daysLate: number;
  expectedAmount: number;
  paidAmount: number;
  remaining: number;
  severity: OverdueSeverity;
}

/** Kết quả nhập danh sách học sinh (POST /students/import). */
export interface ImportError {
  row: number;
  message: string;
}

export interface ImportResult {
  imported: number;
  errors: ImportError[];
}

// ---- Nhập dữ liệu học phí (POST /import/tuition) ----

export type ImportWarningType =
  | 'missing_header'
  | 'invalid_period'
  | 'duplicate_stt'
  | 'duplicate_name'
  | 'similar_name'
  | 'unusual_name'
  | 'total_mismatch'
  | 'total_match'
  | 'total_unassigned'
  | 'zero_value'
  | 'blank_cell'
  | 'partial_payment'
  | 'overpaid'
  | 'invalid_value'
  | 'stray_row';

export interface ImportWarning {
  type: ImportWarningType | string;
  sheet: string;
  row?: number;
  message: string;
}

export interface PreviewPeriod {
  name: string;
  header: string;
  year: number;
  month: number;
  startDate: string | null;
  endDate: string | null;
  dueDate: string | null;
  enrolled: number;
  paid: number;
  partial: number;
  unpaid: number;
  collected: number;
}

export interface PreviewClass {
  name: string;
  sheetName: string;
  exists: boolean;
  defaultFee: number;
  studentCount: number;
  periods: PreviewPeriod[];
}

export interface PreviewTotal {
  sheet: string;
  label: string;
  computed: number;
  manual: number | null;
  match: boolean | null;
}

export interface ImportPreview {
  year: number;
  unit: number;
  sheets: { name: string; classes: string[]; studentCount: number }[];
  classes: PreviewClass[];
  totals: PreviewTotal[];
  studentCount: number;
  paymentCount: number;
  warnings: ImportWarning[];
}

export interface TuitionImportResponse {
  committed: boolean;
  preview: ImportPreview;
  imported?: {
    classesCreated: number;
    studentsCreated: number;
    studentsUpdated: number;
    payments: number;
  };
}

export interface ApiErrorResponse {
  error: string;
}
