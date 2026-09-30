import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import YearSelect from '../components/ui/YearSelect';
import Spinner from '../components/ui/Spinner';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import { overdueService } from '../services/overdueService';
import { getErrorMessage } from '../services/api';
import { OverdueRow } from '../types';
import { formatCurrency } from '../utils/format';

export default function Overdue() {
  const location = useLocation();
  const [year, setYear] = useState(() => {
    const y = Number(new URLSearchParams(location.search).get('year'));
    return Number.isInteger(y) && y >= 2000 && y <= 3000 ? y : new Date().getFullYear();
  });
  const [rows, setRows] = useState<OverdueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const data = await overdueService.list(year);
        if (!cancelled) setRows(data);
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, 'Không thể tải danh sách học sinh quá hạn.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [year]);

  async function handleExport() {
    setExporting(true);
    setError('');
    try {
      await overdueService.exportFile(year);
    } catch (err) {
      setError(getErrorMessage(err, 'Không thể xuất file Excel.'));
    } finally {
      setExporting(false);
    }
  }

  const totalRemaining = rows.reduce((sum, r) => sum + (r.remaining ?? 0), 0);

  const byStudent = useMemo(() => {
    const map = new Map<
      string,
      { studentId: string; studentName: string; className: string; periods: string[]; maxDaysLate: number; total: number }
    >();
    for (const r of rows) {
      const e = map.get(r.studentId) ?? {
        studentId: r.studentId,
        studentName: r.studentName,
        className: r.className,
        periods: [],
        maxDaysLate: 0,
        total: 0,
      };
      e.periods.push(r.periodName);
      e.maxDaysLate = Math.max(e.maxDaysLate, r.daysLate);
      e.total += r.remaining ?? 0;
      map.set(r.studentId, e);
    }
    return [...map.values()].sort(
      (a, b) => b.total - a.total || a.className.localeCompare(b.className, 'vi') || a.studentName.localeCompare(b.studentName, 'vi')
    );
  }, [rows]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Quá hạn</h1>
        <div className="flex flex-wrap gap-2">
          <YearSelect value={year} onChange={setYear} />
          <button type="button" className="btn-secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Đang xuất...' : 'Xuất Excel'}
          </button>
        </div>
      </div>

      {error && <Alert message={error} />}

      {!loading && rows.length > 0 && (
        <p className="text-sm text-slate-600">
          Năm {year}: <span className="font-semibold">{byStudent.length}</span> học sinh nợ học phí,{' '}
          <span className="font-semibold">{rows.length}</span> khoản quá hạn, tổng còn thiếu{' '}
          <span className="font-semibold text-danger-600">{formatCurrency(totalRemaining)}</span>.
        </p>
      )}

      {!loading && byStudent.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Tổng nợ theo học sinh (năm {year})</h2>
          {/* Điện thoại: mỗi học sinh là một thẻ, dòng tổng cộng là thẻ cuối. */}
          <div className="card overflow-hidden p-0 md:hidden">
            <ul className="divide-y divide-slate-100">
              {byStudent.map((s) => (
                <li key={s.studentId} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 font-semibold text-slate-800">{s.studentName}</p>
                    <p className="shrink-0 whitespace-nowrap tabular-nums font-semibold text-danger-600">
                      {formatCurrency(s.total)}
                    </p>
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
                    <div className="min-w-0">
                      <dt className="text-xs text-slate-500">Lớp</dt>
                      <dd className="text-slate-700">{s.className}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Số kỳ</dt>
                      <dd className="tabular-nums text-slate-700">{s.periods.length}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Trễ lâu nhất</dt>
                      <dd className="whitespace-nowrap tabular-nums text-slate-700">{s.maxDaysLate} ngày</dd>
                    </div>
                    <div className="col-span-3 min-w-0">
                      <dt className="text-xs text-slate-500">Các kỳ quá hạn</dt>
                      <dd className="text-slate-700">{s.periods.join(', ')}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
            <div className="flex items-start justify-between gap-3 bg-slate-50 p-4 text-sm font-semibold text-slate-800">
              <div className="min-w-0">
                <p>Tổng cộng ({byStudent.length} học sinh)</p>
                <p className="text-xs font-normal text-slate-500">
                  Số kỳ: <span className="tabular-nums font-semibold text-slate-800">{rows.length}</span>
                </p>
              </div>
              <p className="shrink-0 whitespace-nowrap tabular-nums text-danger-600">{formatCurrency(totalRemaining)}</p>
            </div>
          </div>
          <div className="card hidden overflow-x-auto p-0 md:block">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3 lg:px-4">Học sinh</th>
                  <th className="px-3 py-3 lg:px-4">Lớp</th>
                  <th className="px-3 py-3 lg:px-4">Các kỳ quá hạn</th>
                  <th className="px-3 py-3 text-right lg:px-4">Số kỳ</th>
                  <th className="px-3 py-3 text-right lg:px-4">Trễ lâu nhất</th>
                  <th className="px-3 py-3 text-right lg:px-4">Tổng còn thiếu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byStudent.map((s) => (
                  <tr key={s.studentId} className="hover:bg-slate-50">
                    <td className="px-3 py-3 font-medium text-slate-800 lg:px-4">{s.studentName}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-600 lg:px-4">{s.className}</td>
                    <td className="px-3 py-3 text-slate-600 lg:px-4">{s.periods.join(', ')}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700 lg:px-4">{s.periods.length}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-700 lg:px-4">{s.maxDaysLate} ngày</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums font-semibold text-danger-600 lg:px-4">{formatCurrency(s.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 text-sm font-semibold text-slate-800">
                <tr>
                  <td className="px-3 py-3 lg:px-4" colSpan={3}>
                    Tổng cộng ({byStudent.length} học sinh)
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums lg:px-4">{rows.length}</td>
                  <td className="px-3 py-3 lg:px-4" />
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-danger-600 lg:px-4">{formatCurrency(totalRemaining)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card flex justify-center py-16">
          <Spinner size={28} />
        </div>
      ) : (
        rows.length === 0 && (
          <div className="card p-6">
            <EmptyState message={`Không có học sinh nào quá hạn học phí trong năm ${year}.`} />
          </div>
        )
      )}
    </div>
  );
}
