import { useEffect, useState } from 'react';
import YearSelect from '../components/ui/YearSelect';
import Spinner from '../components/ui/Spinner';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import Badge from '../components/ui/Badge';
import { overdueService } from '../services/overdueService';
import { getErrorMessage } from '../services/api';
import { OverdueRow } from '../types';
import { formatCurrency, MONTH_LABELS } from '../utils/format';

export default function Overdue() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<OverdueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Quá hạn</h1>
        <YearSelect value={year} onChange={setYear} />
      </div>

      {error && <Alert message={error} />}

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size={28} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState message="Không có học sinh nào quá hạn học phí. Tuyệt vời!" />
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Học sinh</th>
                <th className="px-4 py-3">Lớp</th>
                <th className="px-4 py-3">Tháng</th>
                <th className="px-4 py-3">Số ngày trễ</th>
                <th className="px-4 py-3">Số tiền học phí</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{row.studentName}</td>
                  <td className="px-4 py-3 text-slate-600">{row.className}</td>
                  <td className="px-4 py-3 text-slate-600">{MONTH_LABELS[row.month - 1] ?? `T${row.month}`}</td>
                  <td className="px-4 py-3">
                    <Badge color={row.severity === 'red' ? 'red' : 'orange'}>{row.daysLate} ngày</Badge>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-700">{formatCurrency(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
