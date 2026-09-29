interface SpinnerProps {
  size?: number;
  className?: string;
}

export default function Spinner({ size = 24, className = '' }: SpinnerProps) {
  return (
    <div
      className={`inline-block animate-spin rounded-full border-2 border-slate-200 border-t-primary-500 ${className}`}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Đang tải"
    />
  );
}
