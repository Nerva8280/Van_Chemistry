/** Thanh nút định dạng cho chữ đang chọn trong ô sửa (chỉ số dưới/trên, đậm, nghiêng). */
export default function FormatToolbar() {
  function run(cmd: string) {
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand(cmd);
  }
  const btn =
    'inline-flex h-8 min-w-[2.25rem] items-center justify-center rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700 hover:bg-slate-50';
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg bg-slate-100/95 px-3 py-2 text-xs text-slate-600 backdrop-blur">
      <span>Bôi đen chữ trong ô rồi bấm:</span>
      <button type="button" className={btn} title="Chỉ số dưới (ví dụ H₂O)" onMouseDown={(e) => { e.preventDefault(); run('subscript'); }}>
        x<sub>2</sub>
      </button>
      <button type="button" className={btn} title="Chỉ số trên (ví dụ Fe³⁺)" onMouseDown={(e) => { e.preventDefault(); run('superscript'); }}>
        x<sup>2</sup>
      </button>
      <button type="button" className={`${btn} font-bold`} title="In đậm" onMouseDown={(e) => { e.preventDefault(); run('bold'); }}>
        Đ
      </button>
      <button type="button" className={`${btn} italic`} title="In nghiêng" onMouseDown={(e) => { e.preventDefault(); run('italic'); }}>
        N
      </button>
      <span className="hidden sm:inline">Bấm lại lần nữa để bỏ định dạng.</span>
    </div>
  );
}
