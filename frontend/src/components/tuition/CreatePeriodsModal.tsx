import { FormEvent, useEffect, useState } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import Modal from '../ui/Modal';
import Alert from '../ui/Alert';
import { periodService, EnrollMode } from '../../services/periodService';
import { getErrorMessage } from '../../services/api';
import { TuitionColumn } from '../../types';
import { formatDate } from '../../utils/format';

export interface CreatePeriodCandidate {
  classId: string;
  className: string;
  /** Ngày kết thúc của kỳ liền trước (ISO), để điền sẵn ngày bắt đầu kỳ mới. */
  previousEnd: string | null;
}

interface Row {
  checked: boolean;
  start: string;
  end: string;
}

interface Props {
  column: TuitionColumn | null;
  candidates: CreatePeriodCandidate[];
  /** Khi mở từ một lớp cụ thể: chỉ chọn sẵn lớp đó. */
  onlyClassId?: string | null;
  onClose: () => void;
  onCreated: (created: number, done: boolean) => void;
}

const ENROLL_OPTIONS: { value: EnrollMode; label: string; hint: string }[] = [
  { value: 'all', label: 'Tất cả học sinh của lớp', hint: 'Mọi học sinh đang học đều có ô "Chưa đóng" trong kỳ mới.' },
  {
    value: 'previous',
    label: 'Chỉ học sinh có học ở kỳ trước',
    hint: 'Học sinh không học kỳ trước sẽ hiện "—" (bấm vào để thêm).',
  },
  { value: 'none', label: 'Chưa thêm học sinh nào', hint: 'Tất cả hiện "—", bạn bấm vào từng ô để thêm sau.' },
];

function defaultStart(candidate: CreatePeriodCandidate, column: TuitionColumn): string {
  if (candidate.previousEnd) {
    const d = parseISO(candidate.previousEnd);
    if (!Number.isNaN(d.getTime())) return format(addDays(d, 1), 'yyyy-MM-dd');
  }
  return format(new Date(column.year, column.month - 1, 1), 'yyyy-MM-dd');
}

export default function CreatePeriodsModal({ column, candidates, onlyClassId, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [enroll, setEnroll] = useState<EnrollMode>('all');
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!column) return;
    setName(`Tháng ${column.month}`);
    setEnroll('all');
    const init: Record<string, Row> = {};
    candidates.forEach((c) => {
      init[c.classId] = {
        checked: !onlyClassId || c.classId === onlyClassId,
        start: defaultStart(c, column),
        end: '',
      };
    });
    setRows(init);
    setError('');
    // Chỉ khởi tạo khi mở hộp thoại.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [column, onlyClassId]);

  if (!column) return null;

  const chosen = candidates.filter((c) => rows[c.classId]?.checked);
  const invalid = chosen.filter((c) => {
    const r = rows[c.classId];
    return r.start && r.end && r.start > r.end;
  });

  function update(classId: string, patch: Partial<Row>) {
    setRows((prev) => ({ ...prev, [classId]: { ...prev[classId], ...patch } }));
  }

  function copyFirstToAll() {
    const first = chosen[0] && rows[chosen[0].classId];
    if (!first) return;
    setRows((prev) => {
      const next = { ...prev };
      chosen.forEach((c) => (next[c.classId] = { ...next[c.classId], start: first.start, end: first.end }));
      return next;
    });
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!column) return;
    if (!name.trim()) {
      setError('Vui lòng nhập tên kỳ.');
      return;
    }
    if (chosen.length === 0) {
      setError('Hãy chọn ít nhất một lớp.');
      return;
    }
    if (invalid.length > 0) {
      setError(`Ngày bắt đầu phải trước hoặc bằng ngày kết thúc (${invalid.map((c) => c.className).join(', ')}).`);
      return;
    }
    setSaving(true);
    setError('');
    const results = await Promise.allSettled(
      chosen.map((c) => {
        const r = rows[c.classId];
        return periodService.create(c.classId, {
          name: name.trim(),
          year: column.year,
          month: column.month,
          startDate: r.start || null,
          endDate: r.end || null,
          enroll,
        });
      })
    );
    setSaving(false);
    const failedIdx = results.map((r, i) => (r.status === 'rejected' ? i : -1)).filter((i) => i >= 0);
    const createdCount = results.length - failedIdx.length;
    if (failedIdx.length > 0) {
      const first = results[failedIdx[0]] as PromiseRejectedResult;
      setError(
        `${getErrorMessage(first.reason, 'Không thể tạo kỳ học phí.')} (Chưa tạo được: ${failedIdx
          .map((i) => chosen[i].className)
          .join(', ')})`
      );
      setRows((prev) => {
        const next = { ...prev };
        chosen.forEach((c, i) => {
          if (!failedIdx.includes(i)) next[c.classId] = { ...next[c.classId], checked: false };
        });
        return next;
      });
      onCreated(createdCount, false);
      return;
    }
    onCreated(createdCount, true);
  }

  return (
    <Modal
      open={!!column}
      title={`Tạo kỳ học phí — Tháng ${column.month}/${column.year}`}
      onClose={onClose}
      widthClassName="max-w-3xl"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Alert message={error} />}

        {candidates.length === 0 ? (
          <p className="text-sm text-slate-500">Mọi lớp đang hiển thị đều đã có kỳ học phí trong tháng này.</p>
        ) : (
          <>
            <div>
              <label className="label" htmlFor="cp-name">
                Tên kỳ
              </label>
              <input
                id="cp-name"
                className="input max-w-xs"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`Ví dụ: Tháng ${column.month}`}
              />
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-100">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Lớp</th>
                    <th className="px-3 py-2">Từ ngày</th>
                    <th className="px-3 py-2">Đến ngày (hạn đóng)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {candidates.map((c) => {
                    const r = rows[c.classId];
                    if (!r) return null;
                    const bad = r.checked && r.start && r.end && r.start > r.end;
                    return (
                      <tr key={c.classId} className={r.checked ? '' : 'opacity-50'}>
                        <td className="px-3 py-2">
                          <label className="flex cursor-pointer items-center gap-2 font-medium text-slate-800">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-primary-500"
                              checked={r.checked}
                              onChange={(e) => update(c.classId, { checked: e.target.checked })}
                            />
                            {c.className}
                          </label>
                          {c.previousEnd && (
                            <span className="ml-6 block text-[11px] text-slate-400">
                              Kỳ trước kết thúc {formatDate(c.previousEnd)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            className={`input w-auto py-1.5 ${bad ? 'ring-2 ring-danger-300' : ''}`}
                            value={r.start}
                            disabled={!r.checked}
                            onChange={(e) => update(c.classId, { start: e.target.value })}
                            aria-label={`Từ ngày, ${c.className}`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            className={`input w-auto py-1.5 ${bad ? 'ring-2 ring-danger-300' : ''}`}
                            value={r.end}
                            disabled={!r.checked}
                            onChange={(e) => update(c.classId, { end: e.target.value })}
                            aria-label={`Đến ngày, ${c.className}`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="-mt-2 text-xs text-slate-500">
              Hạn đóng học phí là ngày cuối kỳ ("Đến ngày"). Có thể để trống và điền sau khi biết.
              {chosen.length > 1 && (
                <>
                  {' '}
                  <button type="button" className="font-medium text-primary-600 hover:underline" onClick={copyFirstToAll}>
                    Dùng ngày của lớp đầu tiên cho tất cả các lớp đã chọn
                  </button>
                </>
              )}
            </p>

            <fieldset>
              <legend className="label">Thêm học sinh nào vào kỳ mới?</legend>
              <div className="flex flex-col gap-2">
                {ENROLL_OPTIONS.map((o) => (
                  <label key={o.value} className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="enroll"
                      className="mt-0.5 accent-primary-500"
                      checked={enroll === o.value}
                      onChange={() => setEnroll(o.value)}
                    />
                    <span>
                      <span className="font-medium text-slate-800">{o.label}</span>
                      <span className="block text-xs text-slate-500">{o.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        )}

        <div className="flex items-center justify-end gap-2">
          {candidates.length > 0 && <span className="mr-auto text-xs text-slate-500">Đã chọn {chosen.length} lớp</span>}
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Hủy
          </button>
          <button type="submit" className="btn-primary" disabled={saving || chosen.length === 0}>
            {saving ? 'Đang tạo...' : `Tạo kỳ${chosen.length > 1 ? ` cho ${chosen.length} lớp` : ''}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
