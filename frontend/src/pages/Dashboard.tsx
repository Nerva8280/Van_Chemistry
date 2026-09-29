import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import StatCard from '../components/ui/StatCard';
import Spinner from '../components/ui/Spinner';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import Badge from '../components/ui/Badge';
import { dashboardService } from '../services/dashboardService';
import { classService } from '../services/classService';
import { getErrorMessage } from '../services/api';
import { Class, DashboardResponse, PaymentStatus } from '../types';
import { formatCompactCurrency, formatCurrency, formatDate, formatPercent } from '../utils/format';
import { PRIMARY_COLOR, STATUS_BADGE_COLOR, STATUS_COLOR, STATUS_LABEL, STATUS_ORDER } from '../utils/status';

const AXIS_TICK = { fontSize: 12, fill: '#64748b' };
const GRID_STROKE = '#e2e8f0';

const MONTH_STAT_CLASS: Record<PaymentStatus, string> = {
  paid: 'border-l-4 border-success-500',
  partial: 'border-l-4 border-warning-500',
  overdue: 'border-l-4 border-danger-500',
  unpaid: 'border-l-4 border-slate-400',
};

export default function Dashboard() {
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState('');
  const [sheet, setSheet] = useState('');
  const [classId, setClassId] = useState('');
  const [classes, setClasses] = useState<Class[]>([]);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    classService
      .list()
      .then(setClasses)
      .catch(() => {
        // Không bắt buộc: chỉ dùng cho bộ lọc Sheet / Lớp.
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await dashboardService.get({
          year: year ?? undefined,
          month: month ? Number(month) : undefined,
          classId,
          sheet,
        });
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, 'Không thể tải dữ liệu tổng quan.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [year, month, classId, sheet]);

  const sheets = useMemo(
    () => [...new Set(classes.map((c) => c.sheetName).filter((s): s is string => !!s))].sort(),
    [classes]
  );
  const classOptions = sheet ? classes.filter((c) => c.sheetName === sheet) : classes;
  const yearOptions = data?.years?.length ? data.years : [year ?? new Date().getFullYear()];
  const yearValue = year ?? data?.year ?? new Date().getFullYear();
  const selectedMonth = data?.selectedMonth ?? null;
  const monthName = selectedMonth ? `Tháng ${selectedMonth}` : 'tháng đang chọn';

  const byMonthData = useMemo(
    () => (data?.byMonth ?? []).map((m) => ({ ...m, label: m.label || `Tháng ${m.month}` })),
    [data]
  );
  const byClassData = useMemo(
    () => (data?.byClass ?? []).map((c) => ({ ...c, ratePct: Math.round(c.rate * 1000) / 10 })),
    [data]
  );
  const pieData = useMemo(
    () =>
      data
        ? STATUS_ORDER.map((s) => ({ key: s, name: STATUS_LABEL[s], value: data.monthStats[s], color: STATUS_COLOR[s] })).filter(
            (d) => d.value > 0
          )
        : [],
    [data]
  );

  const summary = data?.summary;
  const scopeHint = month ? `Tháng ${month}/${yearValue}` : `Cả năm ${yearValue}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900">Bảng điều khiển</h1>
          {loading && data && <Spinner size={18} />}
        </div>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label text-xs" htmlFor="d-year">
            Năm
          </label>
          <select
            id="d-year"
            className="input w-auto"
            value={yearValue}
            onChange={(e) => {
              setYear(Number(e.target.value));
              setMonth('');
            }}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                Năm {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label text-xs" htmlFor="d-month">
            Tháng
          </label>
          <select id="d-month" className="input w-auto" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">Cả năm</option>
            {(data?.months ?? []).map((m) => (
              <option key={m} value={m}>
                Tháng {m}
              </option>
            ))}
          </select>
        </div>
        {sheets.length > 0 && (
          <div>
            <label className="label text-xs" htmlFor="d-sheet">
              Sheet
            </label>
            <select
              id="d-sheet"
              className="input w-auto"
              value={sheet}
              onChange={(e) => {
                const next = e.target.value;
                setSheet(next);
                const c = classes.find((x) => x.id === classId);
                if (next && c && c.sheetName !== next) setClassId('');
              }}
            >
              <option value="">Tất cả</option>
              {sheets.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="label text-xs" htmlFor="d-class">
            Lớp
          </label>
          <select id="d-class" className="input w-auto" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Tất cả lớp</option>
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <Alert message={error} />}

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Spinner size={32} />
        </div>
      ) : !data || !summary ? (
        <EmptyState message="Không có dữ liệu để hiển thị." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Tổng số lớp" value={summary.totalClasses} />
            <StatCard label="Tổng số học sinh" value={summary.totalStudents} />
            <StatCard label="Tổng học phí dự kiến" value={formatCurrency(summary.totalExpected)} hint={scopeHint} />
            <StatCard label="Tổng đã thu" value={formatCurrency(summary.totalCollected)} hint={scopeHint} />
            <StatCard label="Tổng chưa thu" value={formatCurrency(summary.totalOutstanding)} hint={scopeHint} />
            <StatCard label="Tỷ lệ hoàn thành" value={formatPercent(summary.completionRate)} hint="Đã thu / dự kiến" />
            <StatCard
              label="Trung bình học phí mỗi học sinh"
              value={formatCurrency(summary.averageFeePerStudent)}
            />
            <StatCard label="Số học sinh quá hạn" value={summary.overdueStudentCount} />
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">{monthName}</h2>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {STATUS_ORDER.map((s) => (
                <div key={s} className={`card ${MONTH_STAT_CLASS[s]}`}>
                  <p className="flex items-center gap-1.5 text-sm font-medium text-slate-500">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLOR[s] }} />
                    {STATUS_LABEL[s]}
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                    {data.monthStats[s]} <span className="text-sm font-normal text-slate-400">học sinh</span>
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="card xl:col-span-2">
              <h2 className="mb-4 text-sm font-semibold text-slate-700">Học phí theo tháng</h2>
              {byMonthData.length === 0 ? (
                <EmptyState message="Chưa có dữ liệu học phí trong năm này." />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={byMonthData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={2}>
                    <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
                    <YAxis
                      tick={AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={formatCompactCurrency}
                      width={64}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [formatCurrency(value), name]}
                      cursor={{ fill: '#f1f5f9' }}
                    />
                    <Legend />
                    <Bar dataKey="expected" name="Dự kiến" fill={PRIMARY_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="collected" name="Đã thu" fill={STATUS_COLOR.paid} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card">
              <h2 className="mb-4 text-sm font-semibold text-slate-700">Tỷ lệ thu theo lớp</h2>
              {byClassData.length === 0 ? (
                <EmptyState message="Chưa có dữ liệu lớp học." />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={byClassData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                    <XAxis
                      dataKey="className"
                      tick={{ ...AXIS_TICK, fontSize: 11 }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={false}
                      interval={0}
                    />
                    <YAxis
                      domain={[0, 100]}
                      ticks={[0, 25, 50, 75, 100]}
                      tick={AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => `${v}%`}
                      width={44}
                    />
                    <Tooltip
                      cursor={{ fill: '#f1f5f9' }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0].payload as (typeof byClassData)[number];
                        return (
                          <div className="rounded-lg bg-white px-3 py-2 text-xs shadow ring-1 ring-slate-200">
                            <p className="mb-1 font-semibold text-slate-800">{row.className}</p>
                            <p className="text-slate-600">Tỷ lệ thu: {formatPercent(row.rate)}</p>
                            <p className="text-slate-600">Đã thu: {formatCurrency(row.collected)}</p>
                            <p className="text-slate-600">Dự kiến: {formatCurrency(row.expected)}</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="ratePct" name="Tỷ lệ thu" fill={PRIMARY_COLOR} radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card">
              <h2 className="mb-4 text-sm font-semibold text-slate-700">Trạng thái {monthName}</h2>
              {pieData.length === 0 ? (
                <EmptyState message="Chưa có dữ liệu học phí cho tháng này." />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={95}
                      paddingAngle={2}
                      stroke="#ffffff"
                      strokeWidth={2}
                    >
                      {pieData.map((entry) => (
                        <Cell key={entry.key} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number, name: string) => [`${value} học sinh`, name]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="card overflow-x-auto p-0">
            <h2 className="px-5 pt-5 text-sm font-semibold text-slate-700">Học sinh chưa đóng ({monthName})</h2>
            {data.unpaidList.length === 0 ? (
              <div className="p-5">
                <EmptyState message="Tất cả học sinh đã đóng học phí tháng này." />
              </div>
            ) : (
              <table className="mt-3 min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Học sinh</th>
                    <th className="px-4 py-3">Lớp</th>
                    <th className="px-4 py-3">Kỳ</th>
                    <th className="px-4 py-3">Hạn đóng</th>
                    <th className="px-4 py-3 text-right">Đã đóng</th>
                    <th className="px-4 py-3 text-right">Còn thiếu</th>
                    <th className="px-4 py-3">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.unpaidList.map((row) => (
                    <tr key={row.paymentId} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{row.studentName}</td>
                      <td className="px-4 py-2.5 text-slate-600">{row.className}</td>
                      <td className="px-4 py-2.5 text-slate-600">{row.periodName}</td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {row.dueDate ? formatDate(row.dueDate) : <span className="text-slate-400">Chưa đặt hạn</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{formatCurrency(row.paidAmount)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-slate-800">
                        {formatCurrency(row.remaining)}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge color={STATUS_BADGE_COLOR[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
