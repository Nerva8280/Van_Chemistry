import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { format, parseISO } from 'date-fns';
import Spinner from '../components/ui/Spinner';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { examService, ExamSummary, formatBytes } from '../services/examService';
import { getErrorMessage } from '../services/api';
import { DocxParseError, parseDocx } from '../exam/parseDocx';
import { sanitizeDoc } from '../exam/sanitize';
import { DEFAULT_SETTINGS, ExamData } from '../exam/types';

const MAX_BYTES = 12 * 1024 * 1024;

function formatDateTime(value: string): string {
  try {
    return format(parseISO(value), 'dd/MM/yyyy HH:mm');
  } catch {
    return '';
  }
}

export default function Exams() {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [totalBytes, setTotalBytes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExamSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await examService.list();
      setExams(res.exams);
      setTotalBytes(res.totalBytes);
    } catch (err) {
      setError(getErrorMessage(err, 'Không thể tải danh sách đề.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.doc')) {
      setError('File .doc cũ: mở bằng Word và Lưu thành .docx');
      return;
    }
    if (!lower.endsWith('.docx')) {
      setError('Hiện chỉ hỗ trợ file Word (.docx)');
      return;
    }
    setUploading(true);
    try {
      const { doc, warnings } = await parseDocx(await file.arrayBuffer());
      const data: ExamData = {
        doc: sanitizeDoc(doc),
        settings: { ...DEFAULT_SETTINGS },
        versions: [],
        parseWarnings: warnings,
      };
      if (new Blob([JSON.stringify(data)]).size > MAX_BYTES) {
        setError('Đề quá lớn để lưu (trên 12 MB), thường do ảnh dung lượng lớn. Hãy giảm kích thước ảnh trong Word rồi thử lại.');
        return;
      }
      const title = (file.name.replace(/\.docx$/i, '').trim() || 'Đề mới').slice(0, 200);
      const exam = await examService.create({ title, sourceName: file.name, data });
      navigate(`/exams/${exam.id}`);
    } catch (err) {
      if (err instanceof DocxParseError) setError(err.message);
      else if (axios.isAxiosError(err)) setError(getErrorMessage(err, 'Không thể lưu đề.'));
      else setError('Không đọc được file Word này. Hãy mở file bằng Word, lưu lại dạng .docx rồi thử lại.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await examService.remove(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Không thể xóa đề.'));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Tạo đề</h1>
        <div className="flex items-center gap-2">
          <input ref={fileInput} type="file" accept=".docx,.doc" className="hidden" onChange={handleFile} />
          <button type="button" className="btn-primary" disabled={uploading} onClick={() => fileInput.current?.click()}>
            {uploading ? (
              <>
                <Spinner size={16} /> Đang đọc file...
              </>
            ) : (
              'Tải file Word lên'
            )}
          </button>
        </div>
      </div>

      <p className="text-sm text-slate-500">
        Tải lên file Word (.docx) của đề thi. Bạn sẽ kiểm tra, sửa nội dung, chọn đáp án đúng, rồi tạo các mã đề đã tráo
        câu và in ra (hoặc lưu PDF) kèm bảng đáp án. Hiện chỉ hỗ trợ file Word (.docx).
      </p>

      {error && <Alert message={error} />}

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size={28} />
          </div>
        ) : exams.length === 0 ? (
          <div className="p-6">
            <EmptyState message={'Chưa có đề nào. Bấm "Tải file Word lên" để bắt đầu.'} />
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Tên đề</th>
                <th className="px-4 py-3">File gốc</th>
                <th className="px-4 py-3">Số mã đề</th>
                <th className="px-4 py-3">Dung lượng</th>
                <th className="px-4 py-3">Cập nhật</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {exams.map((ex) => (
                <tr key={ex.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{ex.title}</td>
                  <td className="px-4 py-3 text-slate-500">{ex.sourceName || '—'}</td>
                  <td className="px-4 py-3 tabular-nums">{ex.versionCount}</td>
                  <td className="px-4 py-3 tabular-nums">{formatBytes(ex.sizeBytes)}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(ex.updatedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn-secondary" onClick={() => navigate(`/exams/${ex.id}`)}>
                        Mở
                      </button>
                      <button type="button" className="btn-danger" onClick={() => setDeleteTarget(ex)}>
                        Xóa
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-sm text-slate-600">
        <p>
          Tổng dung lượng đang dùng: <span className="font-semibold">{(totalBytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB</span>
        </p>
        <p className="text-xs text-slate-400">
          Cơ sở dữ liệu miễn phí chứa được khoảng 500 MB (dùng chung với dữ liệu học phí). Xóa các đề không dùng nữa để giải
          phóng dung lượng.
        </p>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Xóa đề"
        message={`Xóa đề "${deleteTarget?.title ?? ''}"? Không thể hoàn tác.`}
        confirmLabel="Xóa"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
