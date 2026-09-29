import { useEffect, useState } from 'react';
import YearSelect from '../components/ui/YearSelect';
import Spinner from '../components/ui/Spinner';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import Badge from '../components/ui/Badge';
import { overdueService } from '../services/overdueService';
import { getErrorMessage } from '../services/api';
import { OverdueRow } from '../types';
import { formatCurrency, formatDate } from '../utils/format';

export default function Overdue() {
  const [year, setYear] = useState(new Date().getFullYear());
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
          Có <span className="font-semibold">{rows.length}</span> khoản quá hạn, tổng còn thiếu{' '}
          <span className="font-semibold">{formatCurrency(totalRemaining)}</span>.
        </p>
      )}

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size={28} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState message={`Không có học sinh nào quá hạn học phí trong năm ${year}.`} />
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Học sinh</th>
                <th className="px-4 py-3">Lớp</th>
                <th className="px-4 py-3">Kỳ</th>
                <th className="px-4 py-3">Hạn đóng</th>
                <th className="px-4 py-3 text-right">Số ngày trễ</th>
                <th className="px-4 py-3 text-right">Học phí</th>
                <th className="px-4 py-3 text-right">Đã đóng</th>
                <th className="px-4 py-3 text-right">Còn thiếu</th>
                <th className="px-4 py-3">Mức độ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.paymentId} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{row.studentName}</td>
                  <td className="px-4 py-3 text-slate-600">{row.className}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {row.periodName}/{row.year}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(row.dueDate)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{row.daysLate} ngày</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{formatCurrency(row.expectedAmount)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{formatCurrency(row.paidAmount)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-800">
                    {formatCurrency(row.remaining)}
                  </td>
                  <td className="px-4 py-3">
                    {row.severity === 'red' ? (
                      <Badge color="red">Trễ &gt; 15 ngày</Badge>
                    ) : (
                      <Badge color="orange">Trễ ≤ 15 ngày</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
