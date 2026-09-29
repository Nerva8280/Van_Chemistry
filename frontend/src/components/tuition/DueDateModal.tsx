import { FormEvent, useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Alert from '../ui/Alert';
import { periodService } from '../../services/periodService';
import { getErrorMessage } from '../../services/api';
import { Period, TuitionColumn } from '../../types';
import { formatDateRange, toDateInput } from '../../utils/format';

export interface DueDateEntry {
  className: string;
  period: Period;
}

interface Props {
  column: TuitionColumn | null;
  entries: DueDateEntry[];
  onClose: () => void;
  /** Gọi sau khi lưu thành công để tải lại bảng. */
  onSaved: (changed: number, done: boolean) => void;
}

export default function DueDateModal({ column, entries, onClose, onSaved }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!column) return;
    const init: Record<string, string> = {};
    entries.forEach((e) => (init[e.period.id] = toDateInput(e.period.dueDate)));
    setValues(init);
    setError('');
    // Chỉ khởi tạo khi mở hộp thoại cho một cột.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [column]);

  if (!column) return null;

  const changed = entries.filter((e) => (values[e.period.id] ?? '') !== toDateInput(e.period.dueDate));

  function setAll(value: string) {
    const next: Record<string, string> = {};
    entries.forEach((e) => (next[e.period.id] = value));
    setValues(next);
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (changed.length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    setError('');
    const results = await Promise.allSettled(
      changed.map((e) => periodService.update(e.period.id, { dueDate: values[e.period.id] || null }))
    );
    setSaving(false);
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed.length > 0) {
      setError(
        `${getErrorMessage(failed[0].reason, 'Không thể lưu hạn đóng.')} (${failed.length}/${changed.length} lớp chưa lưu được)`
      );
      onSaved(changed.length - failed.length, false);
      return;
    }
    onSaved(changed.length, true);
  }

  const first = entries[0] ? values[entries[0].period.id] ?? '' : '';

  return (
    <Modal open={!!column} title={`Đặt hạn đóng — Tháng ${column.month}/${column.year}`} onClose={onClose} widthClassName="max-w-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-slate-500">
          Chọn ngày hạn đóng cho từng lớp. Để trống nếu chưa có hạn. Khoản chưa đóng sẽ chuyển sang "Quá hạn" khi qua
          ngày này.
        </p>
        {error && <Alert message={error} />}
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500">Không có lớp nào có kỳ trong tháng này.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-100">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Lớp</th>
                  <th className="px-3 py-2">Kỳ</th>
                  <th className="px-3 py-2">Thời gian</th>
                  <th className="px-3 py-2">Hạn đóng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((e) => (
                  <tr key={e.period.id}>
                    <td className="px-3 py-2 font-medium text-slate-800">{e.className}</td>
                    <td className="px-3 py-2 text-slate-700">{e.period.name}</td>
                    <td className="px-3 py-2 text-slate-600">{formatDateRange(e.period.startDate, e.period.endDate) || '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <input
                          type="date"
                          className="input w-auto py-1.5"
                          value={values[e.period.id] ?? ''}
                          onChange={(ev) => setValues((v) => ({ ...v, [e.period.id]: ev.target.value }))}
                          aria-label={`Hạn đóng của ${e.className}`}
                        />
                        {values[e.period.id] && (
                          <button
                            type="button"
                            className="rounded px-1.5 py-1 text-xs text-slate-500 hover:bg-slate-100"
                            onClick={() => setValues((v) => ({ ...v, [e.period.id]: '' }))}
                            title="Xóa hạn đóng"
                          >
                            Xóa
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {entries.length > 1 && first && (
          <button
            type="button"
            className="self-start text-sm font-medium text-primary-600 hover:underline"
            onClick={() => setAll(first)}
          >
            Áp dụng ngày của lớp đầu tiên cho tất cả các lớp
          </button>
        )}
        <div className="flex items-center justify-end gap-2">
          {changed.length > 0 && <span className="mr-auto text-xs text-slate-500">{changed.length} lớp có thay đổi</span>}
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Hủy
          </button>
          <button type="submit" className="btn-primary" disabled={saving || entries.length === 0}>
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
