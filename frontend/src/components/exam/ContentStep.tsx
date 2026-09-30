import '../../exam/exam.css';
import { useState } from 'react';
import {
  ExamData,
  ExamDoc,
  ExamSection,
  OPTION_LETTERS,
  Question,
  QuestionAnswer,
  ROMAN,
  STATEMENT_LETTERS,
  SectionKind,
  newId,
} from '../../exam/types';
import { countMissingAnswers, isAnswered, KIND_LABEL, sectionLabel } from '../../exam/versions';
import EditableHtml from './EditableHtml';
import FormatToolbar from './FormatToolbar';
import Badge from '../ui/Badge';
import ConfirmDialog from '../ui/ConfirmDialog';

interface ContentStepProps {
  data: ExamData;
  update: (fn: (d: ExamData) => ExamData) => void;
}

const DEFAULT_TITLES: Record<SectionKind, string> = {
  mcq: 'TRẮC NGHIỆM NHIỀU LỰA CHỌN',
  truefalse: 'TRẮC NGHIỆM ĐÚNG SAI',
  short: 'TRẢ LỜI NGẮN',
};

function emptyAnswer(kind: SectionKind, options: { id: string }[]): QuestionAnswer {
  if (kind === 'mcq') return { mcq: null };
  if (kind === 'truefalse') return { tf: Object.fromEntries(options.map((o) => [o.id, null])) };
  return { short: '' };
}

function newQuestion(kind: SectionKind): Question {
  const options = kind === 'short' ? [] : Array.from({ length: 4 }, () => ({ id: newId(), html: '' }));
  return { id: newId(), stemHtml: '', options, answer: emptyAnswer(kind, options) };
}

export default function ContentStep({ data, update }: ContentStepProps) {
  const doc = data.doc;
  const [deleteTarget, setDeleteTarget] = useState<{ sectionId: string; questionId: string; label: string } | null>(null);
  const missing = countMissingAnswers(doc);

  const updateDoc = (fn: (doc: ExamDoc) => ExamDoc) => update((d) => ({ ...d, doc: fn(d.doc) }));
  const updateSection = (sid: string, fn: (s: ExamSection) => ExamSection) =>
    updateDoc((dd) => ({ ...dd, sections: dd.sections.map((s) => (s.id === sid ? fn(s) : s)) }));
  const updateQuestion = (sid: string, qid: string, fn: (q: Question) => Question) =>
    updateSection(sid, (s) => ({ ...s, questions: s.questions.map((q) => (q.id === qid ? fn(q) : q)) }));

  function changeKind(sid: string, kind: SectionKind) {
    updateSection(sid, (s) => ({
      ...s,
      kind,
      questions: s.questions.map((q) => ({ ...q, answer: emptyAnswer(kind, q.options) })),
    }));
  }

  function removeOption(sid: string, qid: string, oid: string) {
    updateQuestion(sid, qid, (q) => {
      const answer: QuestionAnswer = { ...q.answer };
      if (answer.mcq === oid) answer.mcq = null;
      if (answer.tf) {
        const tf = { ...answer.tf };
        delete tf[oid];
        answer.tf = tf;
      }
      return { ...q, options: q.options.filter((o) => o.id !== oid), answer };
    });
  }

  function addOption(sid: string, qid: string, kind: SectionKind) {
    updateQuestion(sid, qid, (q) => {
      const opt = { id: newId(), html: '' };
      const answer: QuestionAnswer = kind === 'truefalse' ? { ...q.answer, tf: { ...(q.answer.tf ?? {}), [opt.id]: null } } : q.answer;
      return { ...q, options: [...q.options, opt], answer };
    });
  }

  function deleteQuestion() {
    if (!deleteTarget) return;
    const { sectionId, questionId } = deleteTarget;
    updateSection(sectionId, (s) => ({ ...s, questions: s.questions.filter((q) => q.id !== questionId) }));
    setDeleteTarget(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {missing > 0 ? (
          <Badge color="orange">Chưa chọn đáp án: {missing} câu</Badge>
        ) : (
          <Badge color="green">Đã có đáp án cho tất cả các câu</Badge>
        )}
        <span className="text-slate-500">
          Bấm vào chữ để sửa trực tiếp (ví dụ đổi "300 gam" thành "500 gam"). Phần I: bấm ô tròn trước đáp án đúng.
          Phần II: chọn Đúng hoặc Sai cho từng ý. Phần III: gõ đáp án.
        </span>
      </div>

      <FormatToolbar />

      <div className="card ex-paper flex flex-col gap-1">
        <div className="mb-1 font-sans text-xs font-semibold uppercase tracking-wide text-slate-400">
          Phần đầu đề (mã đề sẽ tự đổi theo từng mã đề khi in)
        </div>
        {doc.headerHtml.map((h, i) => (
          <div key={i} className="group flex items-start gap-2">
            <EditableHtml
              className="flex-1"
              html={h}
              onChange={(html) =>
                updateDoc((dd) => ({ ...dd, headerHtml: dd.headerHtml.map((x, j) => (j === i ? html : x)) }))
              }
            />
            <button
              type="button"
              className="ex-tap no-print shrink-0 font-sans text-xs text-slate-400 opacity-0 hover:text-danger-600 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
              onClick={() => updateDoc((dd) => ({ ...dd, headerHtml: dd.headerHtml.filter((_, j) => j !== i) }))}
              title="Xóa dòng này"
            >
              Xóa dòng
            </button>
          </div>
        ))}
        <div>
          <button
            type="button"
            className="ex-tap font-sans text-xs font-medium text-primary-600 hover:underline"
            onClick={() => updateDoc((dd) => ({ ...dd, headerHtml: [...dd.headerHtml, '<div></div>'] }))}
          >
            + Thêm dòng
          </button>
        </div>
      </div>

      {doc.sections.map((sec, si) => (
        <div key={sec.id} className="card flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-800">
              {sectionLabel(si)} ({sec.questions.length} câu)
            </h2>
            <label className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              Loại câu hỏi:
              <select
                className="input w-auto py-1"
                value={sec.kind}
                onChange={(e) => changeKind(sec.id, e.target.value as SectionKind)}
              >
                {(Object.keys(KIND_LABEL) as SectionKind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="ex-paper">
            {sec.titleHtml !== null ? (
              <div className="flex items-start gap-2">
                <EditableHtml
                  className="flex-1"
                  html={sec.titleHtml}
                  onChange={(html) => updateSection(sec.id, (s) => ({ ...s, titleHtml: html }))}
                  placeholder="Tiêu đề phần"
                />
                <button
                  type="button"
                  className="ex-tap shrink-0 font-sans text-xs text-slate-400 hover:text-danger-600"
                  onClick={() => updateSection(sec.id, (s) => ({ ...s, titleHtml: null }))}
                >
                  Bỏ tiêu đề
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="font-sans text-xs font-medium text-primary-600 hover:underline"
                onClick={() =>
                  updateSection(sec.id, (s) => ({
                    ...s,
                    titleHtml: `<div><b>PHẦN ${ROMAN[si] ?? si + 1}. ${DEFAULT_TITLES[s.kind]}</b></div>`,
                  }))
                }
              >
                + Thêm tiêu đề phần (đề gốc không có)
              </button>
            )}
          </div>

          {sec.questions.map((q, qi) => {
            const answered = isAnswered(sec.kind, q.answer, q.options.map((o) => o.id));
            return (
              <div key={q.id} className="ex-paper rounded-lg border border-slate-200 p-3">
                <div className="flex items-start gap-1">
                  <span className="ex-qnum shrink-0 pt-[2px]">Câu {qi + 1}.</span>
                  <EditableHtml
                    className="flex-1"
                    html={q.stemHtml}
                    placeholder="Nội dung câu hỏi"
                    onChange={(html) => updateQuestion(sec.id, q.id, (x) => ({ ...x, stemHtml: html }))}
                  />
                  <div className="flex shrink-0 flex-col items-end gap-1 pl-2 font-sans">
                    {!answered && <Badge color="orange">Chưa chọn đáp án</Badge>}
                    <button
                      type="button"
                      className="ex-tap text-xs text-slate-400 hover:text-danger-600"
                      onClick={() =>
                        setDeleteTarget({ sectionId: sec.id, questionId: q.id, label: `${sectionLabel(si)}, câu ${qi + 1}` })
                      }
                    >
                      Xóa câu
                    </button>
                  </div>
                </div>

                {sec.kind === 'mcq' && (
                  <div className="mt-1 flex flex-col gap-1 pl-4">
                    {q.options.map((o, oi) => (
                      <div key={o.id} className="flex items-start gap-1">
                        <input
                          type="radio"
                          className="mt-1.5 h-4 w-4 shrink-0 accent-success-600"
                          name={`ans-${q.id}`}
                          checked={q.answer.mcq === o.id}
                          onChange={() => updateQuestion(sec.id, q.id, (x) => ({ ...x, answer: { ...x.answer, mcq: o.id } }))}
                          title="Chọn làm đáp án đúng"
                          aria-label={`Đáp án đúng là ${OPTION_LETTERS[oi]}`}
                        />
                        <span
                          className={`ex-letter shrink-0 pt-[2px] ${q.answer.mcq === o.id ? 'text-success-700' : ''}`}
                        >
                          {OPTION_LETTERS[oi]}.
                        </span>
                        <EditableHtml
                          singleLine
                          className="flex-1"
                          html={o.html}
                          placeholder="Nội dung đáp án"
                          onChange={(html) =>
                            updateQuestion(sec.id, q.id, (x) => ({
                              ...x,
                              options: x.options.map((y) => (y.id === o.id ? { ...y, html } : y)),
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="ex-tap shrink-0 px-1 font-sans text-xs text-slate-400 hover:text-danger-600"
                          onClick={() => removeOption(sec.id, q.id, o.id)}
                          title="Xóa đáp án này"
                        >
                          Xóa
                        </button>
                      </div>
                    ))}
                    {q.options.length < 8 && (
                      <button
                        type="button"
                        className="ex-tap self-start font-sans text-xs font-medium text-primary-600 hover:underline"
                        onClick={() => addOption(sec.id, q.id, sec.kind)}
                      >
                        + Thêm đáp án
                      </button>
                    )}
                  </div>
                )}

                {sec.kind === 'truefalse' && (
                  <div className="mt-1 flex flex-col gap-1 pl-4">
                    {q.options.map((o, oi) => {
                      const v = q.answer.tf?.[o.id] ?? null;
                      const setTf = (val: boolean) =>
                        updateQuestion(sec.id, q.id, (x) => ({
                          ...x,
                          answer: { ...x.answer, tf: { ...(x.answer.tf ?? {}), [o.id]: v === val ? null : val } },
                        }));
                      const pill = (active: boolean, color: string) =>
                        `ex-tap rounded-md border px-2 py-0.5 text-xs font-semibold ${
                          active ? color : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-50'
                        }`;
                      return (
                        <div key={o.id} className="flex items-start gap-1">
                          <span className="shrink-0 pt-[2px]">{STATEMENT_LETTERS[oi]})</span>
                          <EditableHtml
                            singleLine
                            className="flex-1"
                            html={o.html}
                            placeholder="Nội dung ý"
                            onChange={(html) =>
                              updateQuestion(sec.id, q.id, (x) => ({
                                ...x,
                                options: x.options.map((y) => (y.id === o.id ? { ...y, html } : y)),
                              }))
                            }
                          />
                          <div className="flex shrink-0 items-center gap-1 pt-0.5 font-sans">
                            <button
                              type="button"
                              className={pill(v === true, 'border-success-500 bg-success-50 text-success-700')}
                              onClick={() => setTf(true)}
                            >
                              Đúng
                            </button>
                            <button
                              type="button"
                              className={pill(v === false, 'border-danger-500 bg-danger-50 text-danger-600')}
                              onClick={() => setTf(false)}
                            >
                              Sai
                            </button>
                            <button
                              type="button"
                              className="ex-tap px-1 text-xs text-slate-400 hover:text-danger-600"
                              onClick={() => removeOption(sec.id, q.id, o.id)}
                              title="Xóa ý này"
                            >
                              Xóa
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {q.options.length < 8 && (
                      <button
                        type="button"
                        className="ex-tap self-start font-sans text-xs font-medium text-primary-600 hover:underline"
                        onClick={() => addOption(sec.id, q.id, sec.kind)}
                      >
                        + Thêm ý
                      </button>
                    )}
                  </div>
                )}

                {sec.kind === 'short' && (
                  <div className="mt-2 flex items-center gap-2 pl-4 font-sans text-sm">
                    <label className="text-slate-600" htmlFor={`short-base-${q.id}`}>
                      Đáp án:
                    </label>
                    <input
                      id={`short-base-${q.id}`}
                      className="input max-w-[12rem] py-1"
                      value={q.answer.short ?? ''}
                      placeholder="Ví dụ: 3,5"
                      onChange={(e) =>
                        updateQuestion(sec.id, q.id, (x) => ({ ...x, answer: { ...x.answer, short: e.target.value } }))
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}

          <button
            type="button"
            className="btn-secondary self-start"
            onClick={() => updateSection(sec.id, (s) => ({ ...s, questions: [...s.questions, newQuestion(s.kind)] }))}
          >
            + Thêm câu hỏi vào {sectionLabel(si)}
          </button>
        </div>
      ))}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Xóa câu hỏi"
        message={`Xóa ${deleteTarget?.label ?? ''}? Câu này cũng bị xóa khỏi mọi mã đề. Không thể hoàn tác.`}
        confirmLabel="Xóa"
        onConfirm={deleteQuestion}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
