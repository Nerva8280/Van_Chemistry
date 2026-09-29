import { useEffect, useState } from 'react';
import YearSelect from '../components/ui/YearSelect';
import Spinner from '../components/ui/Spinner';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import { tuitionService } from '../services/tuitionService';
import { classService } from '../services/classService';
import { getErrorMessage } from '../services/api';
import { Class, TuitionGridStudent } from '../types';
import { formatCurrency, formatDate, MONTH_LABELS } from '../utils/format';

export default function Tuition() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [classes, setClasses] = useState<Class[]>([]);
  const [classFilter, setClassFilter] = useState('');
  const [students, setStudents] = useState<TuitionGridStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingCells, setPendingCells] = useState<Set<string>>(new Set());

  async function loadClasses() {
    try {
      const data = await classService.list();
      setClasses(data);
    } catch {
      // Non-fatal — the grid can still load without the filter list.
    }
  }

  async function loadGrid() {
    setLoading(true);
    setError('');
    try {
      const res = await tuitionService.grid(year, classFilter || undefined);
      setStudents(res.students);
    } catch (err) {
      setError(getErrorMessage(err, 'Không thể tải bảng học phí.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadClasses();
  }, []);

  useEffect(() => {
    loadGrid();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, classFilter]);

  function cellKey(studentId: string, month: number) {
    return `${studentId}-${month}`;
  }

  function isOverdue(dueDate: string, isPaid: boolean) {
    if (isPaid) return false;
    return new Date(dueDate) < new Date();
  }

  async function handleToggle(studentId: string, month: number, nextValue: boolean) {
    const key = cellKey(studentId, month);
    if (pendingCells.has(key)) return;

    const previousStudents = students;
    setStudents((prev) =>
      prev.map((s) =>
        s.id !== studentId
          ? s
          : {
              ...s,
              payments: s.payments.map((p) =>
                p.month !== month ? p : { ...p, isPaid: nextValue, paidDate: nextValue ? new Date().toISOString() : null }
              ),
            }
      )
    );
    setPendingCells((prev) => new Set(prev).add(key));

    try {
      const updated = await tuitionService.setPaid(studentId, year, month, nextValue);
      setStudents((prev) =>
        prev.map((s) =>
          s.id !== studentId
            ? s
            : {
                ...s,
                payments: s.payments.map((p) =>
                  p.month !== month ? p : { ...p, isPaid: updated.isPaid, paidDate: updated.paidDate ?? null }
                ),
              }
        )
      );
    } catch (err) {
      setStudents(previousStudents);
      setError(getErrorMessage(err, 'Không thể cập nhật trạng thái đóng học phí.'));
    } finally {
      setPendingCells((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Học phí</h1>
        <div className="flex flex-wrap gap-2">
          <select className="input w-auto" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
            <option value="">Tất cả lớp</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>
          <YearSelect value={year} onChange={setYear} />
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-success-500" /> Đã đóng
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-slate-300 bg-white" /> Chưa đóng
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-danger-50 ring-1 ring-inset ring-danger-500" /> Quá hạn chưa đóng
        </span>
      </div>

      {error && <Alert message={error} />}

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size={28} />
          </div>
        ) : students.length === 0 ? (
          <div className="p-6">
            <EmptyState message="Không có học sinh nào để hiển thị." />
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3">Học sinh</th>
                <th className="px-2 py-3">Lớp</th>
                <th className="px-2 py-3">Học phí/tháng</th>
                {MONTH_LABELS.map((label) => (
                  <th key={label} className="px-2 py-3 text-center">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((student) => (
                <tr key={student.id} className="hover:bg-slate-50">
                  <td className="sticky left-0 z-10 bg-white px-4 py-3 font-medium text-slate-800 hover:bg-slate-50">
                    {student.fullName}
                  </td>
                  <td className="px-2 py-3 text-slate-600">{student.className}</td>
                  <td className="px-2 py-3 tabular-nums text-slate-600">{formatCurrency(student.monthlyTuitionFee)}</td>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
                    const payment = student.payments.find((p) => p.month === month);
                    if (!payment) {
                      return (
                        <td key={month} className="px-2 py-3 text-center text-slate-300">
                          —
                        </td>
                      );
                    }
                    const overdue = isOverdue(payment.dueDate, payment.isPaid);
                    const key = cellKey(student.id, month);
                    const pending = pendingCells.has(key);
                    const title = payment.isPaid
                      ? `Đã đóng ngày ${formatDate(payment.paidDate)}`
                      : overdue
                      ? `Quá hạn từ ngày ${formatDate(payment.dueDate)}`
                      : `Hạn đóng: ${formatDate(payment.dueDate)}`;
                    return (
                      <td
                        key={month}
                        className={`px-2 py-3 text-center ${overdue ? 'bg-danger-50' : ''}`}
                        title={title}
                      >
                        <input
                          type="checkbox"
                          className={`h-4 w-4 cursor-pointer rounded border-slate-300 accent-success-500 ${
                            overdue && !payment.isPaid ? 'accent-danger-500 ring-1 ring-danger-500' : ''
                          }`}
                          checked={payment.isPaid}
                          disabled={pending}
                          onChange={(e) => handleToggle(student.id, month, e.target.checked)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
