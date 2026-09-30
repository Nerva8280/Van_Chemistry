import '../../exam/exam.css';
import { ExamDoc, Version } from '../../exam/types';
import { answerKey, KIND_LABEL, sectionLabel } from '../../exam/versions';

interface AnswerKeyTableProps {
  doc: ExamDoc;
  version: Version;
  /** true: ô thiếu đáp án tô đỏ (màn hình). */
  highlightMissing?: boolean;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function AnswerKeyTable({ doc, version, highlightMissing = false }: AnswerKeyTableProps) {
  const key = answerKey(doc, version);
  const missing = highlightMissing ? 'bg-danger-50 text-danger-600' : '';

  return (
    <div className="ex-paper">
      <div className="mb-1 font-bold">Mã đề {version.code}</div>
      {key.map((sec) => {
        if (!sec.entries.length) return null;
        const title = `${sectionLabel(sec.index)}. ${KIND_LABEL[sec.kind]}`;
        if (sec.kind === 'mcq') {
          return (
            <div key={sec.index}>
              <div className="italic">{title}</div>
              {chunk(sec.entries, 10).map((row, ri) => (
                <table key={ri} className="ex-answer-table">
                  <tbody>
                    <tr>
                      <th>Câu</th>
                      {row.map((e) => (
                        <th key={e.num}>{e.num}</th>
                      ))}
                    </tr>
                    <tr>
                      <th>Đáp án</th>
                      {row.map((e) => (
                        <td key={e.num} className={e.letter ? 'font-bold' : missing}>
                          {e.letter ?? ''}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              ))}
            </div>
          );
        }
        if (sec.kind === 'truefalse') {
          const width = Math.max(4, ...sec.entries.map((e) => e.statements?.length ?? 0));
          const letters = 'abcdefgh'.slice(0, width).split('');
          return (
            <div key={sec.index}>
              <div className="italic">{title}</div>
              <table className="ex-answer-table">
                <tbody>
                  <tr>
                    <th>Câu</th>
                    {letters.map((l) => (
                      <th key={l}>{l})</th>
                    ))}
                  </tr>
                  {sec.entries.map((e) => (
                    <tr key={e.num}>
                      <th>{e.num}</th>
                      {letters.map((l, li) => {
                        const s = e.statements?.[li];
                        if (!s) return <td key={l} />;
                        return (
                          <td key={l} className={s.value === null ? missing : 'font-bold'}>
                            {s.value === null ? '' : s.value ? 'Đ' : 'S'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return (
          <div key={sec.index}>
            <div className="italic">{title}</div>
            <table className="ex-answer-table">
              <tbody>
                <tr>
                  <th>Câu</th>
                  <th>Đáp án</th>
                </tr>
                {sec.entries.map((e) => (
                  <tr key={e.num}>
                    <th>{e.num}</th>
                    <td className={e.short ? 'min-w-[6rem] font-bold' : `min-w-[6rem] ${missing}`}>{e.short ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
