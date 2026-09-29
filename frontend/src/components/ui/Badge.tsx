import { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  color?: 'orange' | 'red' | 'green' | 'slate';
}

const colorStyles: Record<NonNullable<BadgeProps['color']>, string> = {
  orange: 'bg-warning-50 text-warning-700 ring-warning-100',
  red: 'bg-danger-50 text-danger-600 ring-danger-100',
  green: 'bg-success-50 text-success-700 ring-success-100',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export default function Badge({ children, color = 'slate' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${colorStyles[color]}`}
    >
      {children}
    </span>
  );
}
