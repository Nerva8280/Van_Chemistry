# Contract v2: Hệ thống Quản lý Học phí — API & dữ liệu

Nguồn sự thật cho backend và frontend. Mọi response là JSON; lỗi trả về `{ error: string }` (tiếng Việt).
Base URL phía frontend: `/api` (Vercel rewrite `/api/*` sang backend Render, nên cookie phiên là first-party).
Tiền là số nguyên VNĐ (đồng). Ngày là chuỗi ISO; frontend hiển thị `dd/MM/yyyy`.

## 1. Khái niệm

- **Lớp (Class)**: có `name` và `defaultTuitionFee`.
- **Kỳ học phí (TuitionPeriod)**: thuộc một lớp, ví dụ "Tháng 7 (15/6-14/7)". Có `name` ("Tháng 7"), `year`, `month`
  (1-12, để xếp cột thẳng hàng giữa các lớp), `startDate`, `endDate` (có thể null). **Hạn đóng = `endDate`** (ngày cuối kỳ); kỳ không có `endDate` thì không bao giờ quá hạn.
  Mỗi lớp có tối đa một kỳ cho mỗi (year, month).
- **Khoản học phí (TuitionPayment)**: một học sinh trong một kỳ. `expectedAmount` (học phí dự kiến), `paidAmount`
  (số đã đóng), `isPaid`, `paidDate` (null = không rõ ngày/chưa đóng), `note`.
  **Không có bản ghi = học sinh không học kỳ đó** (hiển thị "—").
- **Trạng thái** (`status`), backend tính sẵn:
  - `paid` — Đã đóng (xanh lá)
  - `partial` — Đóng một phần: chưa `isPaid` nhưng `paidAmount > 0` (cam)
  - `overdue` — Quá hạn: `paidAmount = 0`, chưa đóng, `endDate` < hôm nay (đỏ)
  - `unpaid` — Chưa đóng, chưa tới hạn (xám)

## 2. Auth (không đổi)

`GET /api/auth/google`, `GET /api/auth/microsoft` (điều hướng toàn trang), `GET /api/auth/me` → `{ user }`,
`POST /api/auth/logout`. Mọi route khác cần đăng nhập, nếu không trả `401`.

## 3. Lớp học

- `GET /api/classes` → `Class[]`
  `Class = { id, name, defaultTuitionFee, userId, createdAt, studentCount, periodCount }`
- `POST /api/classes` body `{ name, defaultTuitionFee }` → `Class`
- `PUT /api/classes/:id` body `{ name?, defaultTuitionFee? }` → `Class`
- `DELETE /api/classes/:id` → `204`; `409` nếu lớp còn học sinh.

## 4. Kỳ học phí

`Period = { id, classId, name, year, month, startDate: string|null, endDate: string|null }`

- `GET /api/classes/:id/periods` → `Period[]`
- `POST /api/classes/:id/periods` body `{ name, year, month, startDate?, endDate?, enroll? }` → `Period`
  `enroll`: `"all"` (mặc định, mọi học sinh đang học), `"previous"` (chỉ học sinh
  có trong kỳ liền trước của lớp), `"none"` (chưa thêm ai). `409` nếu trùng tháng.
- `POST /api/classes/:id/periods/generate` body `{ year }` → `{ created: number, periods: Period[] }`
  Tạo các kỳ "Tháng 1".."Tháng 12" còn thiếu của năm đó (từ ngày 1 đến cuối tháng).
- `PUT /api/periods/:id` body `{ name?, year?, month?, startDate?, endDate? }` → `Period`
- `DELETE /api/periods/:id` → `204` (xóa luôn các khoản học phí của kỳ).

## 5. Học sinh

`Student = { id, stt: number|null, fullName, classId, parentEmail, parentPhone, monthlyTuitionFee, active, createdAt, class? }`
(`monthlyTuitionFee` = học phí dự kiến mỗi kỳ; hiển thị là "Học phí mỗi kỳ".)

- `GET /api/students?classId=&search=` → `Student[]`
- `POST /api/students` body `{ fullName, classId, parentEmail?, parentPhone?, monthlyTuitionFee }` → `Student`
  (tự tạo khoản học phí cho các kỳ hiện tại và sắp tới của lớp).
- `PUT /api/students/:id` → `Student` (đổi học phí sẽ cập nhật `expectedAmount` các khoản chưa đóng xong)
- `DELETE /api/students/:id` → `204`
- `POST /api/students/import` (multipart `file`, danh sách học sinh) → `{ imported, errors: {row, message}[] }`
- `GET /api/students/export?classId=` → file .xlsx

## 6. Bảng học phí

`GET /api/tuition?year=&quarter=&classId=&status=&search=`
Mỗi trang là một quý: `quarter` 1 = Tháng 1-3, 2 = Tháng 4-6, 3 = Tháng 7-9, 4 = Tháng 10-12.
Mặc định là năm và quý hiện tại. `status` ∈ paid|partial|overdue|unpaid.

```
{
  year: number,
  quarter: number,
  years: number[],              // năm có dữ liệu + năm nay + năm sau, mới nhất trước
  columns: { year, month }[],   // luôn đủ 3 tháng của quý, kể cả tháng chưa có kỳ
  classes: { id, name, periods: Period[], previousPeriod: Period | null }[],
                                // previousPeriod: kỳ gần nhất trước quý này (để điền sẵn ngày bắt đầu kỳ mới)
  students: {
    id, stt, fullName, classId, monthlyTuitionFee, active,
    payments: Payment[]
  }[]
}
Payment = { id, studentId, periodId, year, month, expectedAmount, paidAmount, isPaid,
            paidDate: string|null, note: string|null, status, updatedAt }
```
Một ô (học sinh, cột): tìm `payment` có cùng year/month. Nếu không có mà lớp của học sinh có kỳ tháng đó → "—"
(không học, có thể thêm). Nếu lớp không có kỳ tháng đó → ô trống, không thao tác.
Khi lọc `status`, chỉ trả về học sinh có ít nhất một khoản đúng trạng thái đó.

- `PATCH /api/tuition/payments/:id` body (một trong các dạng) → `Payment`
  - `{ isPaid: true }` — đánh dấu đã đóng đủ: `paidAmount = expectedAmount`, `paidDate` = ngày cũ hoặc hôm nay
  - `{ isPaid: false }` — bỏ đánh dấu: `paidAmount = 0`, `paidDate = null`
  - `{ paidAmount, paidDate?, isPaid? }` — ghi số tiền; `isPaid` tự bằng `paidAmount >= expectedAmount`,
    trừ khi gửi `isPaid: true` để xác nhận hoàn tất dù chưa đủ tiền
  - `{ note }`
- `POST /api/tuition/payments/bulk-paid` body `{ paymentIds: string[] }` → `{ updated: Payment[] }`
- `POST /api/tuition/payments/bulk-enroll` body `{ studentIds: string[], year, month }` →
  `{ created, alreadyEnrolled, noPeriod: string[] }`. Thêm mỗi học sinh vào kỳ (year, month) của lớp em đó;
  em đã có trong kỳ được bỏ qua; `noPeriod` là tên các em có lớp chưa có kỳ tháng đó.
- `POST /api/tuition/payments` body `{ studentId, periodId }` → `Payment` (thêm học sinh vào một kỳ, ô "—")
- `DELETE /api/tuition/payments/:id` → `204` (bỏ học sinh khỏi kỳ, ô thành "—")

## 7. Dashboard

`GET /api/dashboard?year=&month=&classId=`
Khi có `month`, `overdueStudentCount` chỉ tính riêng tháng đó; không có thì tính cả năm.
```
{
  year, years: number[], months: number[], selectedMonth: number|null,
  summary: { totalClasses,
             totalStudents,        // mọi học sinh của các lớp trong phạm vi lọc (khớp trang Học sinh/Học phí)
             overdueStudentCount },
  monthStats: { paid, partial, overdue, unpaid },   // số học sinh theo trạng thái trong selectedMonth
  byMonth: { month, label, expected, collected }[],
  byClass: { className, expected, collected, rate /* 0..1 */ }[],
  unpaidList: { paymentId, studentId, studentName, className, periodName, month, dueDate,
                expectedAmount, paidAmount, remaining, status }[]   // selectedMonth, trạng thái khác paid
}
```
Nếu không truyền `month`, `selectedMonth` = tháng mới nhất đã bắt đầu.

## 8. Quá hạn

`GET /api/overdue?year=` →
`{ paymentId, studentId, studentName, className, periodName, year, month, dueDate, daysLate, expectedAmount, paidAmount, remaining, severity: "orange"|"red" }[]`
(orange: trễ ≤ 15 ngày; red: > 15 ngày; gồm cả khoản đóng một phần đã quá hạn).

## 9. Nhập dữ liệu học phí (Excel dạng bảng ngang)

- `GET /api/import/tuition/template` → file mẫu .xlsx
- `POST /api/import/tuition` multipart: `file`, `year`, `unit` ("1000" = số trong file là nghìn đồng, "1" = đồng),
  `commit` ("true" để ghi vào DB; mặc định chỉ xem trước)
  → `{ committed: boolean, preview: Preview, imported?: { classesCreated, studentsCreated, studentsUpdated, payments } }`

```
Preview = {
  year, unit,
  classes: { name, exists, defaultFee, studentCount,
             periods: { name, header, year, month, startDate, endDate,
                        enrolled, paid, partial, unpaid, collected }[] }[],
  totals: { sheet, label, computed, manual: number|null, match: boolean|null }[],
  studentCount, paymentCount,
  warnings: { type, sheet, row?, message }[]
}
```
`type` ∈ missing_header, invalid_period, duplicate_stt, duplicate_name, similar_name, unusual_name, total_mismatch,
total_match, total_unassigned, zero_value, blank_cell, partial_payment, overpaid, invalid_value, stray_row.
Nhập lại cùng file sẽ cập nhật (không nhân đôi): lớp, kỳ, học sinh được so khớp theo tên.

## 10. Tạo đề (đề thi và mã đề)

File Word (.docx) được đọc **ngay trên trình duyệt** (`frontend/src/exam/parseDocx.ts`); backend chỉ lưu kết quả dạng JSON.
Ảnh nằm trong JSON dưới dạng data URL (png/jpeg/gif). Mọi route cần đăng nhập, dữ liệu theo chủ sở hữu (`ownerId`);
đề của người khác trả `404`. Route này có bộ đọc JSON riêng giới hạn 15 MB; dữ liệu trên 12 MB bị từ chối (`413`).

`ExamSummary = { id, title, sourceName: string|null, versionCount, sizeBytes, createdAt, updatedAt }`
`Exam = ExamSummary & { data: ExamData }` (`sizeBytes` = số byte của `JSON.stringify(data)`)

- `GET /api/exams` → `{ exams: ExamSummary[], totalBytes }` (mới cập nhật trước; không trả `data`)
- `GET /api/exams/:id` → `Exam`
- `POST /api/exams` body `{ title, sourceName?, data }` → `201 Exam`
- `PUT /api/exams/:id` body `{ title?, data? }` → `Exam` (frontend tự lưu sau ~1,5 giây kể từ lần sửa cuối)
- `DELETE /api/exams/:id` → `204`

Kiểm tra: `title` không rỗng, tối đa 200 ký tự; `data` là object có `doc.sections` là mảng.

```
ExamData = { doc: ExamDoc, settings, versions: Version[], parseWarnings?: string[] }
ExamDoc  = { headerHtml: string[], originalCode: string|null,
             sections: { id, kind: "mcq"|"truefalse"|"short", titleHtml: string|null, questions: Question[] }[] }
Question = { id, stemHtml, options: { id, html }[],        // mcq: A–D; truefalse: ý a–d; short: []
             answer: { mcq?: optionId|null, tf?: { [optionId]: boolean|null }, short?: string } }
settings = { shuffleQuestions, shuffleOptions, shuffleStatements, keepFirstAsOriginal }
Version  = { code, sectionOrder: { [sectionId]: questionId[] }, optionOrder: { [questionId]: optionId[] },
             overrides: { [questionId]: { stemHtml?, options?: { [optionId]: html }, answer? } } }
```
Câu hỏi chỉ được tráo trong phần của nó. Đáp án của một mã đề suy ra từ vị trí của phương án đúng trong
`optionOrder`; ý đúng/sai đi theo nội dung ý; trả lời ngắn lấy `overrides.answer.short` nếu có. Mã đề trong
phần đầu đề nằm trong `<span class="ex-code">` và được thay bằng `Version.code` khi in.
HTML chỉ gồm b, strong, i, em, u, sub, sup, br, span, div, p, img (src `data:`) với class `ex-…`; luôn được làm sạch bằng DOMPurify.

### Tạo đề từ ảnh (AI Gemini)

- `POST /api/exams/ocr` body `{ images: { mimeType: "image/jpeg"|"image/png"|"image/webp", data: string /* base64, không có tiền tố data: */ }[] }`
  → `{ result: OcrResult, model: string }`

Mỗi ảnh là một trang đề, theo thứ tự trang. Kiểm tra: 1–8 ảnh, mỗi ảnh ≤ 4 MB (sau giải mã base64), tổng ≤ 14 MB
(lỗi `400`/`413`). Backend gọi Gemini (`GEMINI_MODEL`, mặc định `gemini-2.5-flash`) bằng REST `generateContent` với
JSON schema, chờ tối đa 100 giây. Lỗi: `503` chưa cấu hình `GEMINI_API_KEY` (hoặc Gemini đang bận); `429` hết lượt/quá
tải; `502` mã API không hợp lệ, bị bộ lọc an toàn chặn, không có kết quả hoặc JSON không đọc được; `504` quá thời gian.

```
OcrResult = {
  headerLines: string[],               // các dòng phần đầu đề (HTML đơn giản)
  originalCode: string|null,           // số MÃ ĐỀ nếu có
  sections: { kind: "mcq"|"truefalse"|"short", title: string|null,
              questions: { stem: string, options: string[] }[] }[],   // không có "Câu N.", "A.", "a)"
  figures: { id: string, image: number /* 1-based */, box_2d: [ymin, xmin, ymax, xmax] /* 0–1000 */ }[],
  warnings: string[]                   // ghi chú tiếng Việt về chỗ khó đọc
}
```
Trong chuỗi: `[[ARROW:trên|dưới]]` / `[[ARROW2:trên|dưới]]` (⇌) là mũi tên có điều kiện, `[[FIG:id]]` là vị trí hình.
Backend chỉ ép kiểu (kẹp `box_2d` vào 0–1000, bỏ hình trỏ tới ảnh không tồn tại), **không** làm sạch HTML. Frontend
(`frontend/src/exam/fromImages.ts`) dựng `ExamDoc` cùng cấu trúc với `parseDocx` (mũi tên dùng chung HTML của công thức
Word, hình cắt từ ảnh thành data URL JPEG), làm sạch bằng DOMPurify, rồi lưu bằng `POST /api/exams` với
`sourceName` = "N ảnh" và cảnh báo trong `parseWarnings`. Ảnh gửi đi không được lưu ở backend.

## 11. Báo cáo & khác

- `GET /api/reports/students/export`, `GET /api/reports/tuition-summary/export?year=`, `GET /api/reports/overdue/export?year=` → .xlsx
- `POST /api/reminders/run-now` → `{ sent }`
- `POST /api/cron/reminders` (header `x-cron-secret`) → `{ sent }` — cho dịch vụ hẹn giờ bên ngoài
- `GET /api/health` → `{ ok: true }`
