export function FacebookIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Facebook">
      <title>Facebook</title>
      <circle cx="12" cy="12" r="12" fill="#1877F2" />
      <path
        fill="#fff"
        d="M13.6 19.5v-6.2h2.1l.3-2.4h-2.4V9.4c0-.7.2-1.2 1.2-1.2H16V6.1c-.2 0-1-.1-1.9-.1-1.9 0-3.1 1.1-3.1 3.2v1.7H8.9v2.4H11v6.2h2.6Z"
      />
    </svg>
  );
}

export function ZaloIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Zalo">
      <title>Zalo</title>
      <rect width="24" height="24" rx="6" fill="#0068FF" />
      <text
        x="12"
        y="15.2"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="8.2"
        fontWeight="700"
        fill="#fff"
      >
        Zalo
      </text>
    </svg>
  );
}

/** Tên Facebook/Zalo của phụ huynh kèm biểu tượng kênh đã chọn; "—" khi chưa có. */
export function ParentContact({
  name,
  facebook,
  zalo,
}: {
  name: string | null | undefined;
  facebook: boolean;
  zalo: boolean;
}) {
  if (!name) return <span className="text-slate-400">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      {facebook && <FacebookIcon />}
      {zalo && <ZaloIcon />}
      <span className="text-slate-700">{name}</span>
    </span>
  );
}
