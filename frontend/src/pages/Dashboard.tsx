import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import StatCard from '../components/ui/StatCard';
import YearSelect from '../components/ui/YearSelect';
import Spinner from '../components/ui/Spinner';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import { dashboardService } from '../services/dashboardService';
import { getErrorMessage } from '../services/api';
import { DashboardCharts, DashboardSummary } from '../types';
import { formatCurrency, formatPercent, MONTH_LABELS } from '../utils/format';

const COLOR_EXPECTED = '#2a78d6'; // primary blue
const COLOR_COLLECTED = '#0ca30c'; // success green
const COLOR_PAID = '#0ca30c';
const COLOR_UNPAID = '#d03b3b';
const COLOR_TREND = '#2a78d6';

function rateColor(rate: number): string {
  if (rate >= 80) return '#0ca30c';
  if (rate >= 50) return '#fab219';
  return '#d03b3b';
}

function compactCurrency(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)} tỷ`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} tr`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)} k`;
  return String(value);
}

export default function Dashboard() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [charts, setCharts] = useState<DashboardCharts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [summaryRes, chartsRes] = await Promise.all([
          dashboardService.summary(year),
          dashboardService.charts(year),
        ]);
        if (!cancelled) {
          // Backend returns completionRate / classCollectionRate.rate as 0-1 fractions;
          // this page's formatting and chart scales (YAxis domain, rateColor thresholds) expect 0-100.
          setSummary({ ...summaryRes, completionRate: summaryRes.completionRate * 100 });
          setCharts({
            ...chartsRes,
            classCollectionRate: chartsRes.classCollectionRate.map((c) => ({ ...c, rate: c.rate * 100 })),
          });
        }
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, 'Không thể tải dữ liệu bảng điều khiển.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [year]);

  const monthlyRevenueData = useMemo(
    () =>
      (charts?.monthlyRevenue ?? []).map((row) => ({
        ...row,
        label: MONTH_LABELS[row.month - 1] ?? `T${row.month}`,
      })),
    [charts]
  );

  const revenueTrendData = useMemo(
    () =>
      (charts?.revenueTrend ?? []).map((row) => ({
        ...row,
        label: MONTH_LABELS[row.month - 1] ?? `T${row.month}`,
      })),
    [charts]
  );

  const paidVsUnpaidData = useMemo(() => {
    if (!charts) return [];
    return [
      { name: 'Đã đóng', value: charts.paidVsUnpaid.paid, color: COLOR_PAID },
      { name: 'Chưa đóng', value: charts.paidVsUnpaid.unpaid, color: COLOR_UNPAID },
    ];
  }, [charts]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Bảng điều khiển</h1>
        <YearSelect value={year} onChange={setYear} />
      </div>

      {error && <Alert message={error} />}

      {loading && !summary ? (
        <div className="flex justify-center py-16">
          <Spinner size={32} />
        </div>
      ) : summary ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Tổng số lớp" value={summary.totalClasses} accent="primary" />
            <StatCard label="Tổng số học sinh" value={summary.totalStudents} accent="primary" />
            <StatCard label="Tổng học phí cần thu" value={formatCurrency(summary.totalExpected)} accent="slate" />
            <StatCard label="Tổng đã thu" value={formatCurrency(summary.totalCollected)} accent="success" />
            <StatCard label="Tổng chưa thu" value={formatCurrency(summary.totalOutstanding)} accent="danger" />
            <StatCard label="Tỷ lệ hoàn thành" value={formatPercent(summary.completionRate)} accent="primary" />
            <StatCard
              label="Số học sinh quá hạn"
              value={summary.overdueStudentCount}
              accent={summary.overdueStudentCount > 0 ? 'danger' : 'success'}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="card">
              <h2 className="mb-4 text-sm font-semibold text-slate-700">Doanh thu theo tháng</h2>
              {monthlyRevenueData.length === 0 ? (
                <EmptyState message="Chưa có dữ liệu doanh thu trong năm này." />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={monthlyRevenueData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#e1e0d9" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#898781' }} axisLine={{ stroke: '#c3c2b7' }} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 12, fill: '#898781' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={compactCurrency}
                      width={56}
                    />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} labelFormatter={(l) => `Tháng ${l.replace('T', '')}`} />
                    <Legend />
                    <Bar dataKey="expected" name="Học phí cần thu" fill={COLOR_EXPECTED} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="collected" name="Đã thu" fill={COLOR_COLLECTED} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card">
              <h2 className="mb-4 text-sm font-semibold text-slate-700">Tỷ lệ thu học phí theo lớp</h2>
              {(charts?.classCollectionRate ?? []).length === 0 ? (
                <EmptyState message="Chưa có dữ liệu lớp học." />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={charts?.classCollectionRate ?? []} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#e1e0d9" vertical={false} />
                    <XAxis dataKey="className" tick={{ fontSize: 12, fill: '#898781' }} axisLine={{ stroke: '#c3c2b7' }} tickLine={false} />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 12, fill: '#898781' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `${v}%`}
                      width={40}
                    />
                    <Tooltip formatter={(value: number) => formatPercent(value)} />
                    <Bar dataKey="rate" name="Tỷ lệ thu" radius={[4, 4, 0, 0]}>
                      {(charts?.classCollectionRate ?? []).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={rateColor(entry.rate)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card">
              <h2 className="mb-4 text-sm font-semibold text-slate-700">Đã đóng / Chưa đóng</h2>
              {!charts || charts.paidVsUnpaid.paid + charts.paidVsUnpaid.unpaid === 0 ? (
                <EmptyState message="Chưa có dữ liệu học phí." />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={paidVsUnpaidData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={95}
                      paddingAngle={2}
                    >
                      {paidVsUnpaidData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => value} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card">
              <h2 className="mb-4 text-sm font-semibold text-slate-700">Xu hướng doanh thu</h2>
              {revenueTrendData.length === 0 ? (
                <EmptyState message="Chưa có dữ liệu xu hướng doanh thu." />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={revenueTrendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#e1e0d9" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#898781' }} axisLine={{ stroke: '#c3c2b7' }} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 12, fill: '#898781' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={compactCurrency}
                      width={56}
                    />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} labelFormatter={(l) => `Tháng ${l.replace('T', '')}`} />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      name="Doanh thu"
                      stroke={COLOR_TREND}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      ) : (
        <EmptyState message="Không có dữ liệu để hiển thị." />
      )}
    </div>
  );
}
