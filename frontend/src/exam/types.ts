// Mô hình dữ liệu của tính năng "Tạo đề". Toàn bộ được lưu dưới dạng JSON trong cột Exam.data.

export type SectionKind = 'mcq' | 'truefalse' | 'short';

export interface ExamOption {
  id: string;
  html: string;
}

export interface QuestionAnswer {
  /** mcq: id của phương án đúng. */
  mcq?: string | null;
  /** truefalse: id ý -> true (Đúng) / false (Sai) / null (chưa chọn). */
  tf?: Record<string, boolean | null>;
  /** short: đáp án trả lời ngắn. */
  short?: string;
}

export interface Question {
  id: string;
  stemHtml: string;
  /** mcq: phương án A–D; truefalse: các ý a–d; short: []. */
  options: ExamOption[];
  answer: QuestionAnswer;
}

export interface ExamSection {
  id: string;
  kind: SectionKind;
  titleHtml: string | null;
  questions: Question[];
}

export interface ExamDoc {
  headerHtml: string[];
  originalCode: string | null;
  sections: ExamSection[];
}

export interface QuestionOverride {
  stemHtml?: string;
  options?: Record<string, string>;
  answer?: QuestionAnswer;
}

export interface Version {
  code: string;
  sectionOrder: Record<string, string[]>;
  optionOrder: Record<string, string[]>;
  overrides: Record<string, QuestionOverride>;
}

export interface ExamSettings {
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  shuffleStatements: boolean;
  keepFirstAsOriginal: boolean;
}

export interface ExamData {
  doc: ExamDoc;
  settings: ExamSettings;
  versions: Version[];
  /** Thời điểm tạo bộ mã đề hiện tại (ISO), để đối chiếu với bản đã in. */
  generatedAt?: string;
  /** Cảnh báo khi đọc file Word (không bắt buộc). */
  parseWarnings?: string[];
}

export const DEFAULT_SETTINGS: ExamSettings = {
  shuffleQuestions: true,
  shuffleOptions: true,
  shuffleStatements: false,
  keepFirstAsOriginal: false,
};

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
export const OPTION_LETTERS = 'ABCDEFGH';
export const STATEMENT_LETTERS = 'abcdefgh';
