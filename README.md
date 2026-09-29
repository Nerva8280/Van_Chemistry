# Hệ thống Quản lý Học phí

Ứng dụng web quản lý học phí dành cho một giáo viên/chủ lớp (single-user), viết bằng React + TypeScript (frontend) và Node.js/Express + Prisma/PostgreSQL (backend). Toàn bộ giao diện bằng tiếng Việt, tiền tệ định dạng VNĐ, ngày tháng dd/MM/yyyy.

## Tính năng

- Đăng nhập Google / Microsoft (OAuth2), phiên đăng nhập lưu trong PostgreSQL.
- Quản lý nhiều lớp học và danh sách học sinh (thêm/sửa/xóa/tìm kiếm, nhập/xuất Excel).
- Lưới điểm danh học phí theo năm (checkbox 12 tháng/học sinh), tự động tô đỏ khoản quá hạn, tự lưu ngày đóng.
- Bảng điều khiển: 7 chỉ số tổng quan + 4 biểu đồ (doanh thu theo tháng, tỷ lệ thu theo lớp, đã đóng/chưa đóng, xu hướng doanh thu).
- Danh sách quá hạn với phân loại màu cam (≤15 ngày) / đỏ (>15 ngày).
- Gửi email nhắc học phí tự động (đến hạn, quá hạn 7 ngày, quá hạn 15 ngày) qua Gmail SMTP, chạy bằng cron hằng ngày.
- Xuất báo cáo Excel: danh sách học sinh, tổng hợp học phí, danh sách quá hạn.

## Cấu trúc dự án

```
backend/     API Node.js/Express + TypeScript + Prisma (PostgreSQL)
frontend/    SPA React + TypeScript + Vite + TailwindCSS + Recharts
docs/        Tài liệu: kiến trúc, ERD, thiết kế API, SQL, hướng dẫn cài đặt/triển khai
```

## Bắt đầu nhanh

1. Đọc [docs/SETUP.md](docs/SETUP.md) để lấy OAuth credentials (Google/Microsoft) và Gmail App Password, cấu hình PostgreSQL.
2. Cấu hình và chạy backend — xem [backend/README.md](backend/README.md).
3. Cấu hình và chạy frontend — xem [frontend/README.md](frontend/README.md).
4. Mở `http://localhost:5173`, đăng nhập, bắt đầu sử dụng.

## Tài liệu

| Tài liệu | Nội dung |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Kiến trúc tổng thể, luồng xác thực, luồng nghiệp vụ, bảo mật |
| [docs/ERD.md](docs/ERD.md) | Sơ đồ quan hệ thực thể (mermaid) |
| [docs/CONTRACT.md](docs/CONTRACT.md) | Hợp đồng dữ liệu/API đầy đủ giữa frontend và backend |
| [docs/API.md](docs/API.md) | Danh sách endpoint REST tóm tắt |
| [docs/DATABASE.sql](docs/DATABASE.sql) | Script SQL thô tạo schema (tương đương Prisma schema) |
| [docs/SETUP.md](docs/SETUP.md) | Hướng dẫn cài đặt & chạy local chi tiết (từng bước lấy OAuth/Gmail credentials) |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Hướng dẫn triển khai production |

## Công nghệ sử dụng

**Frontend**: React 18, TypeScript, Vite, TailwindCSS, Recharts, React Router v6, axios, date-fns.
**Backend**: Node.js, Express, TypeScript, Prisma ORM, Passport.js (Google + Microsoft OAuth2), express-session + connect-pg-simple, Nodemailer, node-cron, xlsx (SheetJS), multer.
**Database**: PostgreSQL.

## Lưu ý triển khai

- Đây là ứng dụng single-user: chỉ người đăng nhập hợp lệ qua Google/Microsoft mới truy cập được; không có tính năng mời/quản lý nhiều người dùng.
- Tỷ lệ (`completionRate`, `classCollectionRate`) được backend trả về dạng phân số 0–1; frontend tự nhân 100 để hiển thị phần trăm (xem [frontend/src/pages/Dashboard.tsx](frontend/src/pages/Dashboard.tsx)).
- Cron job nhắc email cần tiến trình backend chạy liên tục — khi triển khai production, chọn nền tảng hosting chạy Node.js thường trực (không phải serverless function chỉ chạy khi có request).
