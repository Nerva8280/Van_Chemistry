import { useState } from 'react';
import { ExamData, ExamSettings } from '../../exam/types';
import { countMissingAnswers, defaultCodes, generateVersions } from '../../exam/versions';
import Alert from '../ui/Alert';
import ConfirmDialog from '../ui/ConfirmDialog';

interface GenerateStepProps {
  data: ExamData;
  update: (fn: (d: ExamData) => ExamData) => void;
  onGenerated: () => void;
}

const MIN = 2;
const MAX = 5;

export default function GenerateStep({ data, update, onGenerated }: GenerateStepProps) {
  const existing = data.versions;
  const initialCount = existing.length >= MIN && existing.length <= MAX ? existing.length : 4;
  const [count, setCount] = useState(initialCount);
  const [codes, setCodes] = useState<string[]>(
    existing.length === initialCount ? existing.map((v) => v.code) : defaultCodes(data.doc.originalCode, initialCount)
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState('');
  const missing = countMissingAnswers(data.doc);
  const questionCount = data.doc.sections.reduce((n, s) => n + s.questions.length, 0);

  function changeCount(n: number) {
    setCount(n);
    const def = defaultCodes(data.doc.originalCode, n);
    setCodes((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? def[i]));
  }

  const trimmed = codes.map((c) => c.trim());
  let error = '';
  if (trimmed.some((c) => !c)) error = 'Vui lòng nhập đủ mã cho mỗi đề.';
  else if (trimmed.some((c) => c.length > 10)) error = 'Mã đề tối đa 10 ký tự.';
  else if (new Set(trimmed).size !== trimmed.length) error = 'Các mã đề không được trùng nhau.';
  else if (questionCount === 0) error = 'Đề chưa có câu hỏi nào.';

  function setSetting(key: keyof ExamSettings, value: boolean) {
    update((d) => ({ ...d, settings: { ...d.settings, [key]: value } }));
  }

  function generate() {
    setConfirmOpen(false);
    update((d) => ({ ...d, versions: generateVersions(d.doc, d.settings, trimmed) }));
    onGenerated();
  }

  function renameOnly() {
    update((d) => ({ ...d, versions: d.versions.map((v, i) => ({ ...v, code: trimmed[i] ?? v.code })) }));
    setMessage('Đã đổi mã đề (giữ nguyên cách tráo và các chỗ sửa riêng).');
  }

  const toggles: { key: keyof ExamSettings; label: string; hint: string }[] = [
    { key: 'shuffleQuestions', label: 'Tráo thứ tự câu hỏi', hint: 'Câu hỏi chỉ đổi chỗ trong cùng một phần.' },
    { key: 'shuffleOptions', label: 'Tráo thứ tự đáp án A, B, C, D', hint: 'Áp dụng cho phần trắc nghiệm nhiều lựa chọn.' },
    { key: 'shuffleStatements', label: 'Tráo thứ tự các ý a, b, c, d', hint: 'Áp dụng cho phần đúng sai.' },
    { key: 'keepFirstAsOriginal', label: 'Giữ mã đề đầu tiên giống hệt đề gốc', hint: 'Mã đề đầu tiên không bị tráo.' },
  ];

  return (
    <div className="card flex max-w-2xl flex-col gap-5">
      {missing > 0 && (
        <Alert
          variant="info"
          message={`Còn ${missing} câu chưa có đáp án. Bạn vẫn có thể tạo mã đề trước và chọn đáp án sau ở bước 1; bảng đáp án sẽ tự cập nhật.`}
        />
      )}
      {message && <Alert variant="success" message={message} autoHide />}

      <div>
        <label className="label" htmlFor="version-count">
          Số mã đề cần tạo
        </label>
        <select
          id="version-count"
          className="input w-40"
          value={count}
          onChange={(e) => changeCount(Number(e.target.value))}
        >
          {Array.from({ length: MAX - MIN + 1 }, (_, i) => MIN + i).map((n) => (
            <option key={n} value={n}>
              {n} mã đề
            </option>
          ))}
        </select>
      </div>

      <div>
        <span className="label">Mã của từng đề</span>
        <div className="flex flex-wrap gap-2">
          {codes.map((c, i) => (
            <input
              key={i}
              className="input w-24 text-center"
              value={c}
              aria-label={`Mã đề thứ ${i + 1}`}
              onChange={(e) => setCodes((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
            />
          ))}
        </div>
        {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
      </div>

      <div className="flex flex-col gap-3">
        {toggles.map((t) => (
          <label key={t.key} className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-primary-500"
              checked={data.settings[t.key]}
              onChange={(e) => setSetting(t.key, e.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium text-slate-800">{t.label}</span>
              <span className="block text-xs text-slate-500">{t.hint}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={!!error}
          onClick={() => (existing.length ? setConfirmOpen(true) : generate())}
        >
          {existing.length ? 'Tạo lại mã đề' : 'Tạo mã đề'}
        </button>
        {existing.length === count && existing.length > 0 && (
          <button type="button" className="btn-secondary" disabled={!!error} onClick={renameOnly}>
            Chỉ đổi mã, không tráo lại
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Tạo lại mã đề"
        message="Các mã đề đã tạo và những chỗ đã sửa riêng cho từng mã đề sẽ bị thay thế. Không thể hoàn tác. Tiếp tục?"
        confirmLabel="Tạo lại"
        onConfirm={generate}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
