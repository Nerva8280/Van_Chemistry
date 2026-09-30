import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Spinner from '../components/ui/Spinner';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import { studentService } from '../services/studentService';
import { classService } from '../services/classService';
import { getErrorMessage } from '../services/api';
import { Class, ImportResult, Student } from '../types';
import { formatCurrency } from '../utils/format';
import { useDebounce } from '../hooks/useDebounce';

interface FormState {
  fullName: string;
  classId: string;
  parentEmail: string;
  parentPhone: string;
  monthlyTuitionFee: string;
}

const emptyForm: FormState = {
  fullName: '',
  classId: '',
  parentEmail: '',
  parentPhone: '',
  monthlyTuitionFee: '',
};

export default function Students() {
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 350);
  const [classFilter, setClassFilter] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importResultOpen, setImportResultOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadClasses() {
    try {
      const data = await classService.list();
      setClasses(data);
    } catch {
      // Class list failure is non-fatal for the students page; the table can load independently.
    }
  }

  async function loadStudents() {
    setLoading(true);
    setError('');
    try {
      const data = await studentService.list({ classId: classFilter, search: debouncedSearch });
      setStudents(data);
    } catch (err) {
      setError(getErrorMessage(err, 'Không thể tải danh sách học sinh.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadClasses();
  }, []);

  useEffect(() => {
    loadStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classFilter, debouncedSearch]);

  function classOf(student: Student): { name: string } | undefined {
    return classes.find((c) => c.id === student.classId) ?? student.class;
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, classId: classes[0]?.id ?? '' });
    setFormErrors({});
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(student: Student) {
    setEditing(student);
    setForm({
      fullName: student.fullName,
      classId: student.classId,
      parentEmail: student.parentEmail ?? '',
      parentPhone: student.parentPhone ?? '',
      monthlyTuitionFee: String(student.monthlyTuitionFee),
    });
    setFormErrors({});
    setFormError('');
    setModalOpen(true);
  }

  function validate(): boolean {
    const errors: Partial<Record<keyof FormState, string>> = {};
    if (!form.fullName.trim()) errors.fullName = 'Vui lòng nhập họ và tên.';
    if (!form.classId) errors.classId = 'Vui lòng chọn lớp.';
    const fee = Number(form.monthlyTuitionFee);
    if (!form.monthlyTuitionFee.trim()) {
      errors.monthlyTuitionFee = 'Vui lòng nhập học phí.';
    } else if (Number.isNaN(fee) || fee < 0) {
      errors.monthlyTuitionFee = 'Học phí phải là số không âm.';
    }
    if (form.parentEmail.trim() && !/^\S+@\S+\.\S+$/.test(form.parentEmail.trim())) {
      errors.parentEmail = 'Email không hợp lệ.';
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
        fullName: form.fullName.trim(),
        classId: form.classId,
        parentEmail: form.parentEmail.trim() || undefined,
        parentPhone: form.parentPhone.trim() || undefined,
        monthlyTuitionFee: Number(form.monthlyTuitionFee),
      };
      if (editing) {
        await studentService.update(editing.id, payload);
      } else {
        await studentService.create(payload);
      }
      setModalOpen(false);
      await loadStudents();
      await loadClasses();
    } catch (err) {
      setFormError(getErrorMessage(err, 'Không thể lưu học sinh.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await studentService.remove(deleteTarget.id);
      setDeleteTarget(null);
      await loadStudents();
      await loadClasses();
    } catch (err) {
      setError(getErrorMessage(err, 'Không thể xóa học sinh.'));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  function triggerImport() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    setError('');
    try {
      const result = await studentService.importFile(file, classFilter || undefined);
      setImportResult(result);
      setImportResultOpen(true);
      await loadStudents();
      await loadClasses();
    } catch (err) {
      setError(getErrorMessage(err, 'Không thể nhập file Excel.'));
    } finally {
      setImporting(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setError('');
    try {
      await studentService.exportFile(classFilter || undefined);
    } catch (err) {
      setError(getErrorMessage(err, 'Không thể xuất file Excel.'));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Học sinh</h1>
        <div className="flex flex-wrap gap-2">
          <input type="file" accept=".xlsx,.xls,.csv" ref={fileInputRef} className="hidden" onChange={handleFileSelected} />
          <button type="button" className="btn-secondary" onClick={triggerImport} disabled={importing}>
            {importing ? 'Đang nhập...' : 'Nhập Excel'}
          </button>
          <button type="button" className="btn-secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Đang xuất...' : 'Xuất Excel'}
          </button>
          <button type="button" className="btn-primary" onClick={openCreate}>
            + Thêm học sinh
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          className="input max-w-xs"
          placeholder="Tìm theo tên học sinh..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input w-auto" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
          <option value="">Tất cả lớp</option>
          {classes.map((cls) => (
            <option key={cls.id} value={cls.id}>
              {cls.name}
            </option>
          ))}
        </select>
      </div>

      {error && <Alert message={error} />}

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size={28} />
          </div>
        ) : students.length === 0 ? (
          <div className="p-6">
            <EmptyState message="Không tìm thấy học sinh nào." />
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Họ và tên</th>
                <th className="px-4 py-3">Lớp</th>
                <th className="px-4 py-3">Email phụ huynh</th>
                <th className="px-4 py-3">SĐT phụ huynh</th>
                <th className="px-4 py-3">Học phí mỗi kỳ</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((student) => (
                <tr key={student.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {student.fullName}
                    {!student.active && <span className="ml-1 text-xs font-normal text-slate-400">(đã nghỉ)</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{classOf(student)?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{student.parentEmail || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{student.parentPhone || '—'}</td>
                  <td className="px-4 py-3 tabular-nums">{formatCurrency(student.monthlyTuitionFee)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn-secondary" onClick={() => openEdit(student)}>
                        Sửa
                      </button>
                      <button type="button" className="btn-danger" onClick={() => setDeleteTarget(student)}>
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

      <Modal open={modalOpen} title={editing ? 'Sửa học sinh' : 'Thêm học sinh'} onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {formError && <Alert message={formError} />}
          <div>
            <label className="label" htmlFor="fullName">
              Họ và tên
            </label>
            <input
              id="fullName"
              className="input"
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            />
            {formErrors.fullName && <p className="mt-1 text-xs text-danger-600">{formErrors.fullName}</p>}
          </div>
          <div>
            <label className="label" htmlFor="classId">
              Lớp
            </label>
            <select
              id="classId"
              className="input"
              value={form.classId}
              onChange={(e) => setForm((f) => ({ ...f, classId: e.target.value }))}
            >
              <option value="">-- Chọn lớp --</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
            {formErrors.classId && <p className="mt-1 text-xs text-danger-600">{formErrors.classId}</p>}
          </div>
          <div>
            <label className="label" htmlFor="parentEmail">
              Email phụ huynh
            </label>
            <input
              id="parentEmail"
              className="input"
              type="email"
              value={form.parentEmail}
              onChange={(e) => setForm((f) => ({ ...f, parentEmail: e.target.value }))}
            />
            {formErrors.parentEmail && <p className="mt-1 text-xs text-danger-600">{formErrors.parentEmail}</p>}
          </div>
          <div>
            <label className="label" htmlFor="parentPhone">
              Số điện thoại phụ huynh
            </label>
            <input
              id="parentPhone"
              className="input"
              value={form.parentPhone}
              onChange={(e) => setForm((f) => ({ ...f, parentPhone: e.target.value }))}
            />
          </div>
          <div>
            <label className="label" htmlFor="monthlyTuitionFee">
              Học phí mỗi kỳ (VNĐ)
            </label>
            <input
              id="monthlyTuitionFee"
              className="input"
              type="number"
              min={0}
              value={form.monthlyTuitionFee}
              onChange={(e) => setForm((f) => ({ ...f, monthlyTuitionFee: e.target.value }))}
            />
            {formErrors.monthlyTuitionFee && (
              <p className="mt-1 text-xs text-danger-600">{formErrors.monthlyTuitionFee}</p>
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
        title="Xóa học sinh"
        message={`Bạn có chắc chắn muốn xóa học sinh "${deleteTarget?.fullName}"? Hành động này không thể hoàn tác.`}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <Modal open={importResultOpen} title="Kết quả nhập Excel" onClose={() => setImportResultOpen(false)}>
        {importResult && (
          <div className="flex flex-col gap-3">
            <Alert variant="success" message={`Đã nhập thành công ${importResult.imported} học sinh.`} />
            {importResult.errors.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">
                  Có {importResult.errors.length} dòng bị lỗi:
                </p>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-100">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50 text-left uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Dòng</th>
                        <th className="px-3 py-2">Lỗi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {importResult.errors.map((err, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 tabular-nums">{err.row}</td>
                          <td className="px-3 py-2 text-danger-600">{err.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="mt-2 flex justify-end">
              <button type="button" className="btn-primary" onClick={() => setImportResultOpen(false)}>
                Đóng
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
