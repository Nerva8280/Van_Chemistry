interface YearSelectProps {
  value: number;
  onChange: (year: number) => void;
  rangeBack?: number;
  rangeForward?: number;
}

export default function YearSelect({ value, onChange, rangeBack = 4, rangeForward = 1 }: YearSelectProps) {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear + rangeForward; y >= currentYear - rangeBack; y--) {
    years.push(y);
  }
  if (!years.includes(value)) years.unshift(value);

  return (
    <select
      className="input w-auto"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label="Chọn năm"
    >
      {years
        .sort((a, b) => b - a)
        .map((y) => (
          <option key={y} value={y}>
            Năm {y}
          </option>
        ))}
    </select>
  );
}
