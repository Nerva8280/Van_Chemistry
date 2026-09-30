// Logic thuần (không phụ thuộc React/DOM): tráo mã đề, áp dụng sửa riêng, tính đáp án.

import {
  ExamData,
  ExamDoc,
  ExamSettings,
  OPTION_LETTERS,
  QuestionAnswer,
  QuestionOverride,
  ROMAN,
  STATEMENT_LETTERS,
  SectionKind,
  Version,
} from './types';

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Tráo sao cho (nếu được) khác thứ tự ban đầu. */
function shuffleDifferent<T>(arr: T[], rng: () => number): T[] {
  if (arr.length < 2) return [...arr];
  let out = shuffle(arr, rng);
  for (let k = 0; k < 10 && out.every((x, i) => x === arr[i]); k++) out = shuffle(arr, rng);
  return out;
}

export function sectionLabel(index: number): string {
  return `Phần ${ROMAN[index] ?? index + 1}`;
}

export const KIND_LABEL: Record<SectionKind, string> = {
  mcq: 'Trắc nghiệm nhiều lựa chọn',
  truefalse: 'Trắc nghiệm đúng sai',
  short: 'Trả lời ngắn',
};

/** Mã đề mặc định: 101 → 101, 102, …; nếu đề gốc không có mã số thì bắt đầu từ 101. */
export function defaultCodes(originalCode: string | null, count: number): string[] {
  const base = originalCode && /^\d+$/.test(originalCode) ? Number(originalCode) : 101;
  const width = originalCode && /^\d+$/.test(originalCode) ? originalCode.length : 3;
  return Array.from({ length: count }, (_, i) => String(base + i).padStart(width, '0'));
}

function buildOrders(doc: ExamDoc, settings: ExamSettings, original: boolean, rng: () => number) {
  const sectionOrder: Record<string, string[]> = {};
  const optionOrder: Record<string, string[]> = {};
  for (const sec of doc.sections) {
    const ids = sec.questions.map((q) => q.id);
    sectionOrder[sec.id] = !original && settings.shuffleQuestions ? shuffleDifferent(ids, rng) : ids;
    for (const q of sec.questions) {
      if (sec.kind === 'short') continue;
      const oids = q.options.map((o) => o.id);
      const doShuffle = !original && (sec.kind === 'mcq' ? settings.shuffleOptions : settings.shuffleStatements);
      optionOrder[q.id] = doShuffle ? shuffleDifferent(oids, rng) : oids;
    }
  }
  return { sectionOrder, optionOrder };
}

export function generateVersions(
  doc: ExamDoc,
  settings: ExamSettings,
  codes: string[],
  rng: () => number = Math.random
): Version[] {
  return codes.map((code, i) => ({
    code,
    ...buildOrders(doc, settings, settings.keepFirstAsOriginal && i === 0, rng),
    overrides: {},
  }));
}

/** Tráo lại một mã đề, giữ nguyên mã và các chỗ đã sửa riêng. */
export function reshuffleVersion(
  doc: ExamDoc,
  settings: ExamSettings,
  version: Version,
  rng: () => number = Math.random
): Version {
  return { ...version, ...buildOrders(doc, settings, false, rng) };
}

/** Thứ tự đã lưu, bỏ id không còn tồn tại và thêm id mới (câu/đáp án thêm sau khi tạo mã đề) ở cuối. */
export function reconcileOrder(order: string[] | undefined, actual: string[]): string[] {
  const set = new Set(actual);
  const out = (order ?? []).filter((id) => set.has(id));
  const seen = new Set(out);
  for (const id of actual) if (!seen.has(id)) out.push(id);
  return out;
}

export interface ResolvedOption {
  id: string;
  html: string;
  baseHtml: string;
  overridden: boolean;
}

export interface ResolvedQuestion {
  id: string;
  kind: SectionKind;
  stemHtml: string;
  baseStemHtml: string;
  stemOverridden: boolean;
  options: ResolvedOption[];
  answer: QuestionAnswer;
  baseAnswer: QuestionAnswer;
  hasOverride: boolean;
}

export interface ResolvedSection {
  id: string;
  index: number;
  kind: SectionKind;
  titleHtml: string | null;
  questions: ResolvedQuestion[];
}

function effectiveAnswer(base: QuestionAnswer, ov?: QuestionOverride): QuestionAnswer {
  if (!ov?.answer) return base;
  return { ...base, ...ov.answer };
}

/** Nội dung đề theo một mã đề (version = null: đề gốc, thứ tự gốc). */
export function resolveVersion(doc: ExamDoc, version: Version | null): ResolvedSection[] {
  return doc.sections.map((sec, index) => {
    const byId = new Map(sec.questions.map((q) => [q.id, q]));
    const qOrder = version
      ? reconcileOrder(version.sectionOrder[sec.id], sec.questions.map((q) => q.id))
      : sec.questions.map((q) => q.id);
    const questions = qOrder.map((qid): ResolvedQuestion => {
      const q = byId.get(qid)!;
      const ov = version?.overrides[qid];
      const optById = new Map(q.options.map((o) => [o.id, o]));
      const oOrder =
        version && sec.kind !== 'short'
          ? reconcileOrder(version.optionOrder[qid], q.options.map((o) => o.id))
          : q.options.map((o) => o.id);
      const options = oOrder.map((oid) => {
        const o = optById.get(oid)!;
        const ovHtml = ov?.options?.[oid];
        return { id: oid, html: ovHtml ?? o.html, baseHtml: o.html, overridden: ovHtml !== undefined };
      });
      return {
        id: q.id,
        kind: sec.kind,
        stemHtml: ov?.stemHtml ?? q.stemHtml,
        baseStemHtml: q.stemHtml,
        stemOverridden: ov?.stemHtml !== undefined,
        options,
        answer: effectiveAnswer(q.answer, ov),
        baseAnswer: q.answer,
        hasOverride: !!ov && (ov.stemHtml !== undefined || !!(ov.options && Object.keys(ov.options).length) || ov.answer !== undefined),
      };
    });
    return { id: sec.id, index, kind: sec.kind, titleHtml: sec.titleHtml, questions };
  });
}

// ---------------------------------------------------------------------------
// Đáp án

export interface KeyEntry {
  num: number;
  /** mcq: chữ cái A–D hoặc null (chưa chọn). */
  letter?: string | null;
  /** truefalse: từng ý theo thứ tự trong mã đề. */
  statements?: { letter: string; value: boolean | null }[];
  /** short */
  short?: string;
}

export interface KeySection {
  index: number;
  kind: SectionKind;
  entries: KeyEntry[];
}

export function answerKey(doc: ExamDoc, version: Version | null): KeySection[] {
  return resolveVersion(doc, version).map((sec) => ({
    index: sec.index,
    kind: sec.kind,
    entries: sec.questions.map((q, i) => {
      const num = i + 1;
      if (sec.kind === 'mcq') {
        const idx = q.options.findIndex((o) => o.id === q.answer.mcq);
        return { num, letter: idx >= 0 ? OPTION_LETTERS[idx] : null };
      }
      if (sec.kind === 'truefalse') {
        return {
          num,
          statements: q.options.map((o, oi) => ({ letter: STATEMENT_LETTERS[oi], value: q.answer.tf?.[o.id] ?? null })),
        };
      }
      return { num, short: (q.answer.short ?? '').trim() };
    }),
  }));
}

export function isAnswered(kind: SectionKind, answer: QuestionAnswer, optionIds: string[]): boolean {
  if (kind === 'mcq') return !!answer.mcq && optionIds.includes(answer.mcq);
  if (kind === 'truefalse') return optionIds.length > 0 && optionIds.every((id) => typeof answer.tf?.[id] === 'boolean');
  return !!(answer.short ?? '').trim();
}

/** Số câu chưa có đáp án trong đề gốc. */
export function countMissingAnswers(doc: ExamDoc): number {
  let n = 0;
  for (const sec of doc.sections) {
    for (const q of sec.questions) {
      if (!isAnswered(sec.kind, q.answer, q.options.map((o) => o.id))) n++;
    }
  }
  return n;
}

/** Số câu thiếu đáp án trong một mã đề (tính cả đáp án sửa riêng). */
export function countMissingInVersion(doc: ExamDoc, version: Version): number {
  let n = 0;
  for (const sec of resolveVersion(doc, version)) {
    for (const q of sec.questions) {
      if (!isAnswered(sec.kind, q.answer, q.options.map((o) => o.id))) n++;
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// Trình bày

export function htmlToPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, 'x');
}

/** Số phương án mỗi hàng khi in: 4 nếu mọi phương án ngắn (≤ 20 ký tự, không ảnh), 2 nếu ≤ 45, còn lại 1. */
export function optionColumns(htmls: string[]): 1 | 2 | 4 {
  const lens = htmls.map((h) => htmlToPlain(h).trim().length);
  const hasImg = htmls.some((h) => /<img/i.test(h));
  const hasBlock = htmls.some((h) => /<(div|p|br)\b/i.test(h));
  if (hasBlock) return 1;
  if (!hasImg && lens.every((l) => l <= 20)) return 4;
  if (lens.every((l) => l <= 45)) return 2;
  return 1;
}

const CODE_SPAN_RE = /(<span class="ex-code">(?:<[^>]+>)*)([^<]*)/;

export function headerHasCode(headerHtml: string[]): boolean {
  return headerHtml.some((h) => CODE_SPAN_RE.test(h));
}

export function applyCode(html: string, code: string): string {
  const safe = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return html.replace(CODE_SPAN_RE, (_m, open: string) => open + safe);
}

// ---------------------------------------------------------------------------
// Sửa riêng theo mã đề

function cleanOverride(ov: QuestionOverride): QuestionOverride | null {
  const out: QuestionOverride = {};
  if (ov.stemHtml !== undefined) out.stemHtml = ov.stemHtml;
  if (ov.options && Object.keys(ov.options).length) out.options = ov.options;
  if (ov.answer && Object.keys(ov.answer).length) out.answer = ov.answer;
  return Object.keys(out).length ? out : null;
}

export function setVersionOverride(
  data: ExamData,
  versionIndex: number,
  questionId: string,
  patch: (ov: QuestionOverride) => QuestionOverride
): ExamData {
  const versions = data.versions.map((v, i) => {
    if (i !== versionIndex) return v;
    const next = cleanOverride(patch({ ...(v.overrides[questionId] ?? {}) }));
    const overrides = { ...v.overrides };
    if (next) overrides[questionId] = next;
    else delete overrides[questionId];
    return { ...v, overrides };
  });
  return { ...data, versions };
}
