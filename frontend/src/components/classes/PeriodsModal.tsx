import { FormEvent, useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import ConfirmDialog from '../ui/ConfirmDialog';
import Alert from '../ui/Alert';
import Spinner from '../ui/Spinner';
import EmptyState from '../ui/EmptyState';
import { periodService } from '../../services/periodService';
import { getErrorMessage } from '../../services/api';
import { Class, Period } from '../../types';
import { formatDate, toDateInput } from '../../utils/format';

interface Props {
  cls: Class | null;
  onClose: () => void;
  /** Gọi sau khi thêm/sửa/xóa kỳ để trang lớp cập nhật số kỳ. */
  onChanged: () => void;
}

interface FormState {
  name: string;
  year: string;
  month: string;
  startDate: string;
  endDate: string;
  dueDate: string;
}

function emptyForm(): FormState {
  const now = new Date();
  const month = now.getMonth() + 1;
  return { name: `Tháng ${month}`, year: String(now.getFullYear()), month: String(month), startDate: '', endDate: '', dueDate: '' };
}

export default function PeriodsModal({ cls, onClose, onChanged }: Props) {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Period | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Period | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [genYear, setGenYear] = useState(String(new Date().getFullYear()));
  const [genDueDay, setGenDueDay] = useState('');
  const [generating, setGenerating] = useState(false);

  async function load(classId: string) {
    setLoading(true);
    setError('');
    try {
      const data = await periodService.list(classId);
      setPeriods(
        [...data].sort((a, b) => a.year - b.year || a.month - b.month)
      );
    } catch (err) {
      setError(getErrorMessage(err, 'Không thể tải danh sách kỳ học phí.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!cls) return;
    setPeriods([]);
    setSuccess('');
    setFormOpen(false);
    load(cls.id);
  }, [cls]);

  if (!cls) return null;

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setFormError('');
    setFormOpen(true);
    setSuccess('');
  }

  function openEdit(p: Period) {
    setEditing(p);
    setForm({
      name: p.name,
      year: String(p.year),
      month: String(p.month),
      startDate: toDateInput(p.startDate),
      endDate: toDateInput(p.endDate),
      dueDate: toDateInput(p.dueDate),
    });
    setFormError('');
    setFormOpen(true);
    setSuccess('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!cls) return;
    const year = Number(form.year);
    const month = Number(form.month);
    if (!form.name.trim()) return setFormError('Vui lòng nhập tên kỳ.');
    if (!Number.isInteger(year) || year < 2000 || year > 3000) return setFormError('Năm không hợp lệ.');
    if (!Number.isInteger(month) || month < 1 || month > 12) return setFormError('Tháng phải từ 1 đến 12.');
    if (form.startDate && form.endDate && form.startDate > form.endDate)
      return setFormError('Ngày bắt đầu phải trước ngày kết thúc.');

    setSaving(true);
    setFormError('');
    try {
      const payload = {
        name: form.name.trim(),
        year,
        month,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        dueDate: form.dueDate || null,
      };
      if (editing) {
        await periodService.update(editing.id, payload);
        setSuccess(`Đã cập nhật kỳ "${payload.name}".`);
      } else {
        if (!payload.dueDate) delete (payload as { dueDate?: string | null }).dueDate;
        await periodService.create(cls.id, payload);
        setSuccess(`Đã thêm kỳ "${payload.name}". Các học sinh đang học của lớp đã được thêm vào kỳ này.`);
      }
      setFormOpen(false);
      await load(cls.id);
      onChanged();
    } catch (err) {
      setFormError(getErrorMessage(err, 'Không thể lưu kỳ học phí.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!cls || !deleteTarget) return;
    setDeleting(true);
    try {
      await periodService.remove(deleteTarget.id);
      setSuccess(`Đã xóa kỳ "${deleteTarget.name}".`);
      setDeleteTarget(null);
      await load(cls.id);
      onChanged();
    } catch (err) {
      setDeleteTarget(null);
      setError(getErrorMessage(err, 'Không thể xóa kỳ học phí.'));
    } finally {
      setDeleting(false);
    }
  }

  async function handleGenerate() {
    if (!cls) return;
    const year = Number(genYear);
    const dueDay = genDueDay ? Number(genDueDay) : undefined;
    if (!Number.isInteger(year) || year < 2000 || year > 3000) return setError('Năm không hợp lệ.');
    if (dueDay !== undefined && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28))
      return setError('Ngày hạn đóng phải từ 1 đến 28.');
    setGenerating(true);
    setError('');
    setSuccess('');
    try {
      const res = await periodService.generate(cls.id, year, dueDay);
      setSuccess(
        res.created > 0
          ? `Đã tạo ${res.created} kỳ mới cho năm ${year}.`
          : `Năm ${year} đã có đủ 12 kỳ, không cần tạo thêm.`
      );
      await load(cls.id);
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err, 'Không thể tạo kỳ học phí.'));
    } finally {
      setGenerating(false);
    }
  }

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <>
      <Modal open={!deleteTarget} title={`Kỳ học phí – ${cls.name}`} onClose={onClose} widthClassName="max-w-3xl">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-500">
            Mỗi kỳ là một cột trong bảng học phí (ví dụ "Tháng 7" từ 15/06 đến 14/07). Mỗi lớp chỉ có một kỳ cho mỗi
            tháng.
          </p>
          {error && <Alert message={error} />}
          {success && <Alert variant="success" message={success} />}

          <div className="overflow-x-auto rounded-lg border border-slate-100">
            {loading ? (
              <div className="flex justify-center py-10">
                <Spinner />
              </div>
            ) : periods.length === 0 ? (
              <div className="p-4">
                <EmptyState message="Lớp này chưa có kỳ học phí nào." />
              </div>
            ) : (
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Tên</th>
                    <th className="px-3 py-2">Tháng/Năm</th>
                    <th className="px-3 py-2">Từ ngày</th>
                    <th className="px-3 py-2">Đến ngày</th>
                    <th className="px-3 py-2">Hạn đóng</th>
                    <th className="px-3 py-2 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {periods.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-800">{p.name}</td>
                      <td className="px-3 py-2 tabular-nums text-slate-600">
                        {p.month}/{p.year}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{formatDate(p.startDate) || '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{formatDate(p.endDate) || '—'}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {p.dueDate ? formatDate(p.dueDate) : <span className="text-slate-400">Chưa đặt hạn</span>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-2">
                          <button type="button" className="btn-secondary px-3 py-1" onClick={() => openEdit(p)}>
                            Sửa
                          </button>
                          <button type="button" className="btn-danger px-3 py-1" onClick={() => setDeleteTarget(p)}>
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {formOpen ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-primary-100 bg-primary-50/40 p-4">
              <h3 className="text-sm font-semibold text-slate-800">{editing ? 'Sửa kỳ học phí' : 'Thêm kỳ học phí'}</h3>
              {formError && <Alert message={formError} />}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <label className="label" htmlFor="p-name">
                    Tên kỳ
                  </label>
                  <input
                    id="p-name"
                    className="input"
                    value={form.name}
                    onChange={(e) => set({ name: e.target.value })}
                    placeholder="Ví dụ: Tháng 7 hoặc Kỳ 1"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="p-year">
                    Năm
                  </label>
                  <input
                    id="p-year"
                    className="input"
                    type="number"
                    min={2000}
                    max={3000}
                    value={form.year}
                    onChange={(e) => set({ year: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="p-month">
                    Tháng (cột trong bảng)
                  </label>
                  <select
                    id="p-month"
                    className="input"
                    value={form.month}
                    onChange={(e) => {
                      const m = e.target.value;
                      // Tự đổi tên nếu tên đang là "Tháng N" mặc định.
                      const auto = /^Tháng \d{1,2}$/.test(form.name.trim()) || !form.name.trim();
                      set(auto ? { month: m, name: `Tháng ${m}` } : { month: m });
                    }}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        Tháng {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="p-start">
                    Từ ngày
                  </label>
                  <input
                    id="p-start"
                    className="input"
                    type="date"
                    value={form.startDate}
                    onChange={(e) => set({ startDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="p-end">
                    Đến ngày
                  </label>
                  <input
                    id="p-end"
                    className="input"
                    type="date"
                    value={form.endDate}
                    onChange={(e) => {
                      const v = e.target.value;
                      set({ endDate: v });
                    }}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="p-due">
                    Hạn đóng
                  </label>
                  <input
                    id="p-due"
                    className="input"
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => set({ dueDate: e.target.value })}
                  />
                  <p className="mt-1 text-xs text-slate-400">Không bắt buộc. Để trống nếu chưa có hạn.</p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={() => setFormOpen(false)} disabled={saving}>
                  Hủy
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Đang lưu...' : 'Lưu kỳ'}
                </button>
              </div>
            </form>
          ) : (
            <div>
              <button type="button" className="btn-primary" onClick={openCreate}>
                + Thêm kỳ
              </button>
            </div>
          )}

          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Tạo 12 kỳ theo tháng</h3>
              <p className="text-xs text-slate-500">
                Tạo nhanh các kỳ "Tháng 1" đến "Tháng 12" còn thiếu của một năm (mỗi kỳ từ ngày 1 đến cuối tháng). Hạn đóng không bắt buộc, có thể đặt sau.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="label" htmlFor="g-year">
                  Năm
                </label>
                <input
                  id="g-year"
                  className="input w-28"
                  type="number"
                  min={2000}
                  max={3000}
                  value={genYear}
                  onChange={(e) => setGenYear(e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="g-due">
                  Hạn đóng: ngày
                </label>
                <select id="g-due" className="input w-36" value={genDueDay} onChange={(e) => setGenDueDay(e.target.value)}>
                  <option value="">Chưa đặt hạn</option>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      Ngày {d}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className="btn-secondary" onClick={handleGenerate} disabled={generating}>
                {generating ? 'Đang tạo...' : 'Tạo 12 kỳ theo tháng'}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Đóng
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Xóa kỳ học phí"
        message={`Xóa kỳ "${deleteTarget?.name}" (${deleteTarget?.month}/${deleteTarget?.year})? Toàn bộ dữ liệu học phí (đã đóng, số tiền, ngày đóng) của học sinh trong kỳ này cũng sẽ bị xóa. Không thể hoàn tác.`}
        confirmLabel="Xóa kỳ"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
