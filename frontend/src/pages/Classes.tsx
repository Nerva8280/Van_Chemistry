import { FormEvent, useEffect, useState } from 'react';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Spinner from '../components/ui/Spinner';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import PeriodsModal from '../components/classes/PeriodsModal';
import { classService } from '../services/classService';
import { getErrorMessage } from '../services/api';
import { Class } from '../types';
import { formatCurrency, formatDate } from '../utils/format';

interface FormState {
  name: string;
  defaultTuitionFee: string;
}

const emptyForm: FormState = { name: '', defaultTuitionFee: '' };

export default function Classes() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Class | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<Class | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [periodsClass, setPeriodsClass] = useState<Class | null>(null);

  async function loadClasses() {
    setLoading(true);
    setError('');
    try {
      const data = await classService.list();
      setClasses(data);
    } catch (err) {
      setError(getErrorMessage(err, 'Không thể tải danh sách lớp học.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadClasses();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormErrors({});
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(cls: Class) {
    setEditing(cls);
    setForm({ name: cls.name, defaultTuitionFee: String(cls.defaultTuitionFee) });
    setFormErrors({});
    setFormError('');
    setModalOpen(true);
  }

  function validate(): boolean {
    const errors: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) errors.name = 'Vui lòng nhập tên lớp.';
    const fee = Number(form.defaultTuitionFee);
    if (!form.defaultTuitionFee.trim()) {
      errors.defaultTuitionFee = 'Vui lòng nhập học phí mặc định.';
    } else if (Number.isNaN(fee) || fee < 0) {
      errors.defaultTuitionFee = 'Học phí phải là số không âm.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        name: form.name.trim(),
        defaultTuitionFee: Number(form.defaultTuitionFee),
      };
      if (editing) {
        await classService.update(editing.id, payload);
      } else {
        await classService.create(payload);
      }
      setModalOpen(false);
      await loadClasses();
    } catch (err) {
      setFormError(getErrorMessage(err, 'Không thể lưu lớp học.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await classService.remove(deleteTarget.id);
      setDeleteTarget(null);
      await loadClasses();
    } catch (err) {
      setError(getErrorMessage(err, 'Không thể xóa lớp học.'));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Lớp học</h1>
        <button type="button" className="btn-primary" onClick={openCreate}>
          + Thêm lớp học
        </button>
      </div>

      {error && <Alert message={error} autoHide />}

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size={28} />
          </div>
        ) : classes.length === 0 ? (
          <div className="p-6">
            <EmptyState message="Chưa có lớp học nào. Hãy thêm lớp học đầu tiên." />
          </div>
        ) : (
          <>
          {/* Điện thoại: mỗi lớp là một thẻ. */}
          <ul className="divide-y divide-slate-100 md:hidden">
            {classes.map((cls) => (
              <li key={cls.id} className="p-4">
                <p className="font-semibold text-slate-800">{cls.name}</p>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-slate-500">Số học sinh</dt>
                    <dd className="tabular-nums text-slate-800">{cls.studentCount}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Số kỳ</dt>
                    <dd className="tabular-nums text-slate-800">{cls.periodCount ?? 0}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Học phí mặc định</dt>
                    <dd className="whitespace-nowrap tabular-nums text-slate-800">{formatCurrency(cls.defaultTuitionFee)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Ngày tạo</dt>
                    <dd className="whitespace-nowrap text-slate-600">{formatDate(cls.createdAt)}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex gap-2">
                  <button type="button" className="btn-secondary min-h-[40px] flex-1 px-3" onClick={() => setPeriodsClass(cls)}>
                    Kỳ học phí
                  </button>
                  <button type="button" className="btn-secondary min-h-[40px] flex-1 px-3" onClick={() => openEdit(cls)}>
                    Sửa
                  </button>
                  <button type="button" className="btn-danger min-h-[40px] flex-1 px-3" onClick={() => setDeleteTarget(cls)}>
                    Xóa
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <table className="hidden min-w-full divide-y divide-slate-100 text-sm md:table">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3 lg:px-4">Tên lớp</th>
                <th className="px-3 py-3 lg:px-4">Số học sinh</th>
                <th className="px-3 py-3 lg:px-4">Số kỳ</th>
                <th className="px-3 py-3 lg:px-4">Học phí mặc định</th>
                <th className="px-3 py-3 lg:px-4">Ngày tạo</th>
                <th className="px-3 py-3 text-right lg:px-4">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {classes.map((cls) => (
                <tr key={cls.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-800 lg:px-4">{cls.name}</td>
                  <td className="px-3 py-3 tabular-nums lg:px-4">{cls.studentCount}</td>
                  <td className="px-3 py-3 tabular-nums lg:px-4">{cls.periodCount ?? 0}</td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums lg:px-4">{formatCurrency(cls.defaultTuitionFee)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-500 lg:px-4">{formatDate(cls.createdAt)}</td>
                  <td className="whitespace-nowrap px-3 py-3 lg:px-4">
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn-secondary" onClick={() => setPeriodsClass(cls)}>
                        Kỳ học phí
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => openEdit(cls)}>
                        Sửa
                      </button>
                      <button type="button" className="btn-danger" onClick={() => setDeleteTarget(cls)}>
                        Xóa
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </>
        )}
      </div>

      <Modal open={modalOpen} title={editing ? 'Sửa lớp học' : 'Thêm lớp học'} onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {formError && <Alert message={formError} autoHide />}
          <div>
            <label className="label" htmlFor="name">
              Tên lớp
            </label>
            <input
              id="name"
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ví dụ: Lớp Hóa 12.1"
            />
            {formErrors.name && <p className="mt-1 text-xs text-danger-600">{formErrors.name}</p>}
          </div>
          <div>
            <label className="label" htmlFor="defaultTuitionFee">
              Học phí mặc định mỗi kỳ (VNĐ)
            </label>
            <input
              id="defaultTuitionFee"
              className="input"
              type="number"
              min={0}
              value={form.defaultTuitionFee}
              onChange={(e) => setForm((f) => ({ ...f, defaultTuitionFee: e.target.value }))}
              placeholder="Ví dụ: 500000"
            />
            {formErrors.defaultTuitionFee && (
              <p className="mt-1 text-xs text-danger-600">{formErrors.defaultTuitionFee}</p>
            )}
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Hủy
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Xóa lớp học"
        message={`Bạn có chắc chắn muốn xóa lớp "${deleteTarget?.name}"? Hành động này không thể hoàn tác.`}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <PeriodsModal cls={periodsClass} onClose={() => setPeriodsClass(null)} onChanged={() => {
          classService
            .list()
            .then(setClasses)
            .catch(() => {
              // Cập nhật nền số kỳ; lỗi không ảnh hưởng thao tác trong hộp thoại.
            });
        }}
      />
    </div>
  );
}
