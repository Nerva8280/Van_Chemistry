import { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  accent?: 'primary' | 'success' | 'danger' | 'warning' | 'slate';
  hint?: string;
  /** Khi có: cả thẻ là liên kết tới trang này. */
  to?: string;
}

const accentStyles: Record<NonNullable<StatCardProps['accent']>, string> = {
  primary: 'bg-primary-50 text-primary-600',
  success: 'bg-success-50 text-success-700',
  danger: 'bg-danger-50 text-danger-600',
  warning: 'bg-warning-50 text-warning-700',
  slate: 'bg-slate-100 text-slate-600',
};

export default function StatCard({ label, value, icon, accent = 'slate', hint, to }: StatCardProps) {
  const body = (
    <>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <p className={`mt-1 truncate text-2xl font-semibold tabular-nums ${to ? 'text-primary-600' : 'text-slate-900'}`}>
          {value}
        </p>
        {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      </div>
      {icon && (
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accentStyles[accent]}`}>
          {icon}
        </div>
      )}
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        className="card flex items-start justify-between gap-3 transition-shadow hover:shadow-md hover:ring-1 hover:ring-primary-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
      >
        {body}
      </Link>
    );
  }
  return <div className="card flex items-start justify-between gap-3">{body}</div>;
}
