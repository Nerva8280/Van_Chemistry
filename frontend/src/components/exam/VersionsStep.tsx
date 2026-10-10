import '../../exam/exam.css';
import { useState } from 'react';
import { format } from 'date-fns';
import { ExamData } from '../../exam/types';
import { ResolvedQuestion, reshuffleVersion, restoreCode, setVersionOverride } from '../../exam/versions';
import { sanitizeHtml } from '../../exam/sanitize';
import ExamPaper from './ExamPaper';
import FormatToolbar from './FormatToolbar';
import Alert from '../ui/Alert';
import EmptyState from '../ui/EmptyState';
import ConfirmDialog from '../ui/ConfirmDialog';

interface VersionsStepProps {
  data: ExamData;
  update: (fn: (d: ExamData) => ExamData) => void;
  onPrint: (codes: string[]) => void;
  onGoGenerate: () => void;
}

export const PDF_HINT = "Trong hộp thoại in, chọn máy in là 'Lưu thành PDF' (Save as PDF) để lưu file PDF.";

export default function VersionsStep({ data, update, onPrint, onGoGenerate }: VersionsStepProps) {
  const [selected, setSelected] = useState(0);
  const [confirmReshuffle, setConfirmReshuffle] = useState(false);
  const versions = data.versions;

  if (!versions.length) {
    return (
      <div className="card flex flex-col items-center gap-3">
        <EmptyState message="Chưa có mã đề nào. Hãy sang bước 2 để tạo mã đề." />
        <button type="button" className="btn-primary" onClick={onGoGenerate}>
          Sang bước 2. Tạo mã đề
        </button>
      </div>
    );
  }

  const idx = Math.min(selected, versions.length - 1);
  const version = versions[idx];
  const overrideCount = Object.keys(version.overrides).length;

  const same = (a: string, b: string) => a === sanitizeHtml(b);

  function onStem(q: ResolvedQuestion, html: string) {
    update((d) =>
      setVersionOverride(d, idx, q.id, (ov) => ({ ...ov, stemHtml: same(html, q.baseStemHtml) ? undefined : html }))
    );
  }

  function onOption(q: ResolvedQuestion, optionId: string, html: string) {
    const base = q.options.find((o) => o.id === optionId)?.baseHtml ?? '';
    update((d) =>
      setVersionOverride(d, idx, q.id, (ov) => {
        const options = { ...(ov.options ?? {}) };
        if (same(html, base)) delete options[optionId];
        else options[optionId] = html;
        return { ...ov, options };
      })
    );
  }

  function onShortAnswer(q: ResolvedQuestion, value: string) {
    update((d) =>
      setVersionOverride(d, idx, q.id, (ov) => ({
        ...ov,
        answer: value === (q.baseAnswer.short ?? '') ? undefined : { short: value },
      }))
    );
  }

  function onHeader(i: number, html: string) {
    update((d) => ({
      ...d,
      doc: { ...d.doc, headerHtml: d.doc.headerHtml.map((h, j) => (j === i ? restoreCode(html, h) : h)) },
    }));
  }

  function onSectionTitle(sectionId: string, html: string) {
    update((d) => ({
      ...d,
      doc: { ...d.doc, sections: d.doc.sections.map((s) => (s.id === sectionId ? { ...s, titleHtml: html } : s)) },
    }));
  }

  function onClearOverride(q: ResolvedQuestion) {
    update((d) => ({
      ...d,
      versions: d.versions.map((v, i) => {
        if (i !== idx) return v;
        const overrides = { ...v.overrides };
        delete overrides[q.id];
        return { ...v, overrides };
      }),
    }));
  }

  function reshuffle() {
    setConfirmReshuffle(false);
    update((d) => ({
      ...d,
      versions: d.versions.map((v, i) => (i === idx ? reshuffleVersion(d.doc, d.settings, v) : v)),
    }));
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-500">
        Bộ {versions.length} mã đề đã lưu{data.generatedAt && `, tạo lúc ${format(new Date(data.generatedAt), 'HH:mm dd/MM/yyyy')}`}.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-600">Chọn mã đề:</span>
        {versions.map((v, i) => (
          <button
            key={v.code + i}
            type="button"
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold max-sm:min-h-[40px] max-sm:min-w-[48px] [@media(pointer:coarse)]:min-h-[40px] ${
              i === idx ? 'bg-primary-500 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50'
            }`}
            onClick={() => setSelected(i)}
          >
            {v.code}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" onClick={() => setConfirmReshuffle(true)}>
          Tráo lại mã đề này
        </button>
        <button type="button" className="btn-primary" onClick={() => onPrint([version.code])}>
          In / Lưu PDF mã đề này
        </button>
        <button type="button" className="btn-secondary" onClick={() => onPrint(versions.map((v) => v.code))}>
          In tất cả mã đề
        </button>
      </div>

      <Alert variant="info" message={PDF_HINT} />
      <p className="text-sm text-slate-500">
        Đây là mã đề {version.code} đúng như khi in. Sửa chữ ở đây chỉ áp dụng cho riêng mã đề này (ví dụ mỗi mã đề một số
        liệu khác). Muốn sửa cho mọi mã đề, hãy sửa ở bước 1.
        {overrideCount > 0 && ` Mã đề này có ${overrideCount} câu đã sửa riêng.`}
      </p>
      <p className="text-sm text-slate-500">
        Riêng <b>phần đầu đề</b> và <b>tiêu đề các phần</b> dùng chung cho mọi mã đề: sửa ở đây sẽ áp dụng cho tất cả mã
        đề (số mã đề vẫn tự đổi theo từng đề).
      </p>

      <FormatToolbar />

      <div className="overflow-x-auto">
        <div className="ex-sheet">
          <div className="ex-code-badge">Mã đề {version.code}</div>
          <ExamPaper
            doc={data.doc}
            version={version}
            code={version.code}
            editable
            onStem={onStem}
            onOption={onOption}
            onShortAnswer={onShortAnswer}
            onClearOverride={onClearOverride}
            onHeader={onHeader}
            onSectionTitle={onSectionTitle}
          />
        </div>
      </div>

      <ConfirmDialog
        open={confirmReshuffle}
        title={`Tráo lại mã đề ${version.code}`}
        message={`Thứ tự câu hỏi và đáp án của mã đề ${version.code} sẽ bị thay bằng cách tráo mới. Nếu đã in hoặc phát mã đề này thì sẽ không đối chiếu lại được. Không thể hoàn tác. Tiếp tục?`}
        confirmLabel="Tráo lại"
        onConfirm={reshuffle}
        onCancel={() => setConfirmReshuffle(false)}
      />
    </div>
  );
}
