# Contract v2: Hệ thống Quản lý Học phí — API & dữ liệu

Nguồn sự thật cho backend và frontend. Mọi response là JSON; lỗi trả về `{ error: string }` (tiếng Việt).
Base URL phía frontend: `/api` (Vercel rewrite `/api/*` sang backend Render, nên cookie phiên là first-party).
Tiền là số nguyên VNĐ (đồng). Ngày là chuỗi ISO; frontend hiển thị `dd/MM/yyyy`.

## 1. Khái niệm

- **Lớp (Class)**: có `sheetName` (sheet nguồn khi nhập Excel, có thể null) và `defaultTuitionFee`.
- **Kỳ học phí (TuitionPeriod)**: thuộc một lớp, ví dụ "Tháng 7 (15/6-14/7)". Có `name` ("Tháng 7"), `year`, `month`
  (1-12, để xếp cột thẳng hàng giữa các lớp), `startDate`, `endDate` (có thể null), `dueDate` (hạn đóng).
  Mỗi lớp có tối đa một kỳ cho mỗi (year, month).
- **Khoản học phí (TuitionPayment)**: một học sinh trong một kỳ. `expectedAmount` (học phí dự kiến), `paidAmount`
  (số đã đóng), `isPaid`, `paidDate` (null = không rõ ngày/chưa đóng), `note`.
  **Không có bản ghi = học sinh không học kỳ đó** (hiển thị "—").
- **Trạng thái** (`status`), backend tính sẵn:
  - `paid` — Đã đóng (xanh lá)
  - `partial` — Đóng một phần: chưa `isPaid` nhưng `paidAmount > 0` (cam)
  - `overdue` — Quá hạn: `paidAmount = 0`, chưa đóng, `dueDate` < hôm nay (đỏ)
  - `unpaid` — Chưa đóng, chưa tới hạn (xám)

## 2. Auth (không đổi)

`GET /api/auth/google`, `GET /api/auth/microsoft` (điều hướng toàn trang), `GET /api/auth/me` → `{ user }`,
`POST /api/auth/logout`. Mọi route khác cần đăng nhập, nếu không trả `401`.

## 3. Lớp học

- `GET /api/classes` → `Class[]`
  `Class = { id, name, sheetName: string|null, defaultTuitionFee, userId, createdAt, studentCount, periodCount }`
- `POST /api/classes` body `{ name, defaultTuitionFee, sheetName? }` → `Class`
- `PUT /api/classes/:id` body `{ name?, defaultTuitionFee?, sheetName? }` → `Class`
- `DELETE /api/classes/:id` → `204`; `409` nếu lớp còn học sinh.

## 4. Kỳ học phí

`Period = { id, classId, name, year, month, startDate: string|null, endDate: string|null, dueDate }`

- `GET /api/classes/:id/periods` → `Period[]`
- `POST /api/classes/:id/periods` body `{ name, year, month, startDate?, endDate?, dueDate? }` → `Period`
  (dueDate mặc định = endDate). Tự tạo khoản học phí (chưa đóng) cho mọi học sinh đang học của lớp. `409` nếu trùng tháng.
- `POST /api/classes/:id/periods/generate` body `{ year, dueDay? }` → `{ created: number, periods: Period[] }`
  Tạo các kỳ "Tháng 1".."Tháng 12" còn thiếu của năm đó (dueDay 1-28, mặc định 5).
- `PUT /api/periods/:id` body `{ name?, year?, month?, startDate?, endDate?, dueDate? }` → `Period`
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

`GET /api/tuition?year=&month=&classId=&sheet=&status=&search=`
(`status` ∈ paid|partial|overdue|unpaid; mặc định `year` = năm mới nhất có dữ liệu)

```
{
  year: number,
  years: number[],              // các năm có dữ liệu, mới nhất trước
  sheets: string[],             // các sheetName đang có
  columns: { year, month }[],   // các cột tháng, tăng dần
  classes: { id, name, sheetName, periods: Period[] }[],
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
- `POST /api/tuition/payments` body `{ studentId, periodId }` → `Payment` (thêm học sinh vào một kỳ, ô "—")
- `DELETE /api/tuition/payments/:id` → `204` (bỏ học sinh khỏi kỳ, ô thành "—")

## 7. Dashboard

`GET /api/dashboard?year=&month=&classId=&sheet=`
Khi có `month`, các tổng trong `summary` chỉ tính riêng tháng đó; không có thì tính cả năm.
```
{
  year, years: number[], months: number[], selectedMonth: number|null,
  summary: { totalClasses, totalStudents, totalExpected, totalCollected, totalOutstanding,
             completionRate /* 0..1 */, averageFeePerStudent, overdueStudentCount },
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
  sheets: { name, classes: string[], studentCount }[],
  classes: { name, sheetName, exists, defaultFee, studentCount,
             periods: { name, header, year, month, startDate, endDate, dueDate,
                        enrolled, paid, partial, unpaid, collected }[] }[],
  totals: { sheet, label, computed, manual: number|null, match: boolean|null }[],
  studentCount, paymentCount,
  warnings: { type, sheet, row?, message }[]
}
```
`type` ∈ missing_header, invalid_period, duplicate_stt, duplicate_name, similar_name, unusual_name, total_mismatch,
total_match, total_unassigned, zero_value, blank_cell, partial_payment, overpaid, invalid_value, stray_row.
Nhập lại cùng file sẽ cập nhật (không nhân đôi): lớp, kỳ, học sinh được so khớp theo tên.

## 10. Báo cáo & khác

- `GET /api/reports/students/export`, `GET /api/reports/tuition-summary/export?year=`, `GET /api/reports/overdue/export?year=` → .xlsx
- `POST /api/reminders/run-now` → `{ sent }`
- `POST /api/cron/reminders` (header `x-cron-secret`) → `{ sent }` — cho dịch vụ hẹn giờ bên ngoài
- `GET /api/health` → `{ ok: true }`
