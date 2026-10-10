import '../../exam/exam.css';
import { ExamDoc, OPTION_LETTERS, STATEMENT_LETTERS, Version } from '../../exam/types';
import { applyCode, headerHasCode, optionColumns, resolveVersion, ResolvedQuestion } from '../../exam/versions';
import SafeHtml from './SafeHtml';
import EditableHtml from './EditableHtml';
import Badge from '../ui/Badge';

interface ExamPaperProps {
  doc: ExamDoc;
  version: Version | null;
  code: string;
  /** Sửa riêng theo mã đề (bước 3). */
  editable?: boolean;
  showEnd?: boolean;
  onStem?: (q: ResolvedQuestion, html: string) => void;
  onOption?: (q: ResolvedQuestion, optionId: string, html: string) => void;
  onShortAnswer?: (q: ResolvedQuestion, value: string) => void;
  onClearOverride?: (q: ResolvedQuestion) => void;
  /** Sửa phần đầu đề / tiêu đề phần (dùng chung cho mọi mã đề). */
  onHeader?: (index: number, html: string) => void;
  onSectionTitle?: (sectionId: string, html: string) => void;
}

/** Trình bày một mã đề đúng như khi in. */
export default function ExamPaper({
  doc,
  version,
  code,
  editable = false,
  showEnd = true,
  onStem,
  onOption,
  onShortAnswer,
  onClearOverride,
  onHeader,
  onSectionTitle,
}: ExamPaperProps) {
  const sections = resolveVersion(doc, version);
  const hasCode = headerHasCode(doc.headerHtml);

  return (
    <div className="ex-paper">
      <div className="ex-header">
        {doc.headerHtml.map((h, i) =>
          editable && onHeader ? (
            <EditableHtml key={i} html={applyCode(h, code)} onChange={(html) => onHeader(i, html)} />
          ) : (
            <SafeHtml key={i} as="div" html={applyCode(h, code)} />
          )
        )}
        {!hasCode && <div className="ex-code-line">Mã đề: {code}</div>}
      </div>

      {sections.map((sec) => (
        <div key={sec.id} className="ex-section">
          {sec.titleHtml !== null &&
            (editable && onSectionTitle ? (
              <EditableHtml
                className="ex-section-title"
                html={sec.titleHtml}
                onChange={(html) => onSectionTitle(sec.id, html)}
              />
            ) : (
              sec.titleHtml && <SafeHtml as="div" className="ex-section-title" html={sec.titleHtml} />
            ))}
          {sec.questions.map((q, qi) => {
            const num = qi + 1;
            const cols = sec.kind === 'mcq' ? optionColumns(q.options.map((o) => o.html)) : 1;
            const correctIdx = sec.kind === 'mcq' ? q.options.findIndex((o) => o.id === q.answer.mcq) : -1;

            if (!editable) {
              return (
                <div key={q.id} className="ex-question">
                  <div>
                    <span className="ex-qnum">Câu {num}.</span> <SafeHtml html={q.stemHtml} />
                  </div>
                  {sec.kind === 'mcq' && (
                    <div className={`ex-options ex-cols-${cols}`}>
                      {q.options.map((o, oi) => (
                        <div key={o.id}>
                          <span className="ex-letter">{OPTION_LETTERS[oi]}.</span> <SafeHtml html={o.html} />
                        </div>
                      ))}
                    </div>
                  )}
                  {sec.kind === 'truefalse' &&
                    q.options.map((o, oi) => (
                      <div key={o.id}>
                        {STATEMENT_LETTERS[oi]}) <SafeHtml html={o.html} />
                      </div>
                    ))}
                </div>
              );
            }

            return (
              <div
                key={q.id}
                className={`ex-question rounded-lg p-2 ${q.hasOverride ? 'bg-warning-50/60 ring-1 ring-warning-100' : ''}`}
              >
                {q.hasOverride && (
                  <div className="no-print mb-1 flex flex-wrap items-center gap-2 font-sans text-xs">
                    <Badge color="orange">Đã sửa riêng cho mã đề này</Badge>
                    <button
                      type="button"
                      className="ex-tap font-medium text-primary-600 hover:underline"
                      onClick={() => onClearOverride?.(q)}
                    >
                      Bỏ sửa riêng
                    </button>
                  </div>
                )}
                <div className="flex items-start gap-1">
                  <span className="ex-qnum shrink-0 pt-[2px]">Câu {num}.</span>
                  <EditableHtml
                    className={`flex-1 ${q.stemOverridden ? 'ex-overridden' : ''}`}
                    html={q.stemHtml}
                    onChange={(h) => onStem?.(q, h)}
                  />
                </div>
                {sec.kind === 'mcq' && (
                  <div className={`ex-options ex-cols-${cols}`}>
                    {q.options.map((o, oi) => (
                      <div key={o.id} className="flex items-start gap-1">
                        <span
                          className={`ex-letter shrink-0 pt-[2px] ${oi === correctIdx ? 'rounded bg-success-100 px-1 text-success-700' : ''}`}
                          title={oi === correctIdx ? 'Đáp án đúng' : undefined}
                        >
                          {OPTION_LETTERS[oi]}.
                        </span>
                        <EditableHtml
                          singleLine
                          className={`flex-1 ${o.overridden ? 'ex-overridden' : ''}`}
                          html={o.html}
                          onChange={(h) => onOption?.(q, o.id, h)}
                        />
                      </div>
                    ))}
                  </div>
                )}
                {sec.kind === 'truefalse' &&
                  q.options.map((o, oi) => {
                    const v = q.answer.tf?.[o.id];
                    return (
                      <div key={o.id} className="flex items-start gap-1">
                        <span className="shrink-0 pt-[2px]">{STATEMENT_LETTERS[oi]})</span>
                        <EditableHtml
                          singleLine
                          className={`flex-1 ${o.overridden ? 'ex-overridden' : ''}`}
                          html={o.html}
                          onChange={(h) => onOption?.(q, o.id, h)}
                        />
                        {typeof v === 'boolean' && (
                          <span className="no-print shrink-0 pt-1 font-sans text-xs font-semibold text-success-700">
                            {v ? 'Đúng' : 'Sai'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                {sec.kind === 'short' && (
                  <div className="no-print mt-1 flex flex-wrap items-center gap-2 font-sans text-sm">
                    <label className="text-slate-600" htmlFor={`short-${q.id}`}>
                      Đáp án của mã đề này:
                    </label>
                    <input
                      id={`short-${q.id}`}
                      className="input max-w-[12rem] py-1"
                      value={q.answer.short ?? ''}
                      onChange={(e) => onShortAnswer?.(q, e.target.value)}
                      placeholder="Ví dụ: 3,5"
                    />
                    {(q.answer.short ?? '') !== (q.baseAnswer.short ?? '') && (
                      <span className="text-xs text-warning-700">Đáp án gốc: {q.baseAnswer.short || '(trống)'}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {showEnd && <div className="ex-end">--- HẾT ---</div>}
    </div>
  );
}
