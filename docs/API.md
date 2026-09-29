# Thiết kế REST API

Base URL: `${BACKEND_URL}/api` (mặc định `http://localhost:4000/api`)

Xác thực: session cookie (httpOnly). Mọi endpoint bên dưới (trừ nhóm `Auth`) yêu cầu đã đăng nhập, nếu không trả về `401 { error: "Unauthorized" }`.

## Auth

| Method | Path | Mô tả |
|---|---|---|
| GET | `/auth/google` | Bắt đầu luồng OAuth Google |
| GET | `/auth/google/callback` | Callback Google, tạo session, redirect về frontend |
| GET | `/auth/microsoft` | Bắt đầu luồng OAuth Microsoft |
| GET | `/auth/microsoft/callback` | Callback Microsoft, tạo session, redirect về frontend |
| GET | `/auth/me` | `{ user: User \| null }` |
| POST | `/auth/logout` | Hủy session |

## Lớp học (Classes)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/classes` | — | `Class[]` (kèm `studentCount`) |
| POST | `/classes` | `{ name, defaultTuitionFee }` | `Class` |
| PUT | `/classes/:id` | `{ name?, defaultTuitionFee? }` | `Class` |
| DELETE | `/classes/:id` | — | `204` |

## Học sinh (Students)

| Method | Path | Body / Query | Response |
|---|---|---|---|
| GET | `/students?classId=&search=` | — | `Student[]` |
| POST | `/students` | `{ fullName, classId, parentEmail?, parentPhone?, monthlyTuitionFee }` | `Student` |
| PUT | `/students/:id` | các field trên (optional) | `Student` |
| DELETE | `/students/:id` | — | `204` |
| POST | `/students/import` | multipart `file` (.xlsx/.csv) | `{ imported, errors: {row, message}[] }` |
| GET | `/students/export?classId=` | — | file `.xlsx` |

Cột Excel/CSV khi import (tiêu đề tiếng Việt): `Họ và tên`, `Lớp`, `Email phụ huynh`, `Số điện thoại`, `Học phí`.

## Học phí (Tuition grid)

| Method | Path | Body / Query | Response |
|---|---|---|---|
| GET | `/tuition?year=&classId=` | — | `{ students: [{ id, fullName, className, monthlyTuitionFee, payments: [{month, isPaid, paidDate, dueDate}] }] }` |
| PUT | `/tuition/:studentId/:year/:month` | `{ isPaid: boolean }` | `TuitionPayment` cập nhật |

## Bảng điều khiển (Dashboard)

| Method | Path | Response |
|---|---|---|
| GET | `/dashboard/summary?year=` | `{ totalClasses, totalStudents, totalExpected, totalCollected, totalOutstanding, completionRate, overdueStudentCount }` |
| GET | `/dashboard/charts?year=` | `{ monthlyRevenue, classCollectionRate, paidVsUnpaid, revenueTrend }` |

## Quá hạn (Overdue)

| Method | Path | Response |
|---|---|---|
| GET | `/overdue?year=` | `{ studentName, className, month, daysLate, amount, severity }[]` |

## Báo cáo (Reports)

| Method | Path | Response |
|---|---|---|
| GET | `/reports/students/export` | file `.xlsx` danh sách học sinh |
| GET | `/reports/tuition-summary/export?year=` | file `.xlsx` tổng hợp học phí |
| GET | `/reports/overdue/export?year=` | file `.xlsx` danh sách quá hạn |

## Nhắc nhở (Reminders)

| Method | Path | Response |
|---|---|---|
| POST | `/reminders/run-now` | `{ sent: number }` — chạy thủ công tác vụ nhắc nhở (dùng để kiểm thử) |

Chi tiết đầy đủ, cấu trúc dữ liệu và luật nghiệp vụ: xem [CONTRACT.md](CONTRACT.md).
