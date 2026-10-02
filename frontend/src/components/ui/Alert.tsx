import { useEffect, useState } from 'react';

interface AlertProps {
  message: string;
  variant?: 'error' | 'success' | 'info';
  /** Hide after 3 s (action results, errors). Leave off for guidance that must stay visible. */
  autoHide?: boolean;
}

const AUTO_HIDE_MS = 3000;

const variantStyles = {
  error: 'bg-danger-50 text-danger-600 ring-danger-100',
  success: 'bg-success-50 text-success-700 ring-success-100',
  info: 'bg-primary-50 text-primary-700 ring-primary-100',
};

export default function Alert({ message, variant = 'error', autoHide = false }: AlertProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    if (!autoHide) return;
    const timer = window.setTimeout(() => setVisible(false), AUTO_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [message, autoHide]);

  if (!visible) return null;
  return (
    <div role={variant === 'error' ? 'alert' : 'status'} className={`rounded-lg px-4 py-3 text-sm ring-1 ring-inset ${variantStyles[variant]}`}>
      {message}
    </div>
  );
}
