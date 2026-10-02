import { FormEvent, useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Alert from '../ui/Alert';
import { periodService } from '../../services/periodService';
import { getErrorMessage } from '../../services/api';
import { Period } from '../../types';
import { toDateInput } from '../../utils/format';

export interface EditPeriodTarget {
  className: string;
  period: Period;
}

interface Props {
  target: EditPeriodTarget | null;
  onClose: () => void;
  onSaved: (period: Period) => void;
}

/** Sửa tên và ngày của một kỳ học phí của lớp ngay trên bảng học phí. */
export default function EditPeriodModal({ target, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!target) return;
    setName(target.period.name);
    setStart(toDateInput(target.period.startDate));
    setEnd(toDateInput(target.period.endDate));
    setError('');
  }, [target]);

  if (!target) return null;
  const { period } = target;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Vui lòng nhập tên kỳ.');
    if (start && end && start > end) return setError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
    setSaving(true);
    setError('');
    try {
      const updated = await periodService.update(period.id, {
        name: name.trim(),
        startDate: start || null,
        endDate: end || null,
      });
      onSaved(updated);
    } catch (err) {
      setError(getErrorMessage(err, 'Không thể lưu kỳ học phí.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!target} title={`Sửa kỳ học phí – ${target.className}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Alert message={error} autoHide />}
        <p className="text-sm text-slate-500">
          Kỳ của cột Tháng {period.month}/{period.year}. Đổi ngày ở đây áp dụng cho cả lớp, trừ các em đã đặt kỳ riêng.
        </p>
        <div>
          <label className="label" htmlFor="ep-name">
            Tên kỳ
          </label>
          <input id="ep-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="ep-start">
              Từ ngày
            </label>
            <input id="ep-start" className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="ep-end">
              Đến ngày (hạn đóng)
            </label>
            <input id="ep-end" className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        {!end && <p className="-mt-2 text-xs text-slate-500">Để trống "Đến ngày" thì kỳ này chưa có hạn đóng (không tính quá hạn).</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Hủy
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
