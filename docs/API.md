# Thiết kế REST API (tóm tắt)

Base URL: `/api` (trên production: `https://van-chemistry.vercel.app/api`, Vercel chuyển tiếp sang backend Render).
Xác thực bằng cookie phiên; mọi nhóm trừ `Auth` và `health`/`cron` cần đăng nhập (nếu không: `401`).
Chi tiết dữ liệu trả về và luật nghiệp vụ: [CONTRACT.md](CONTRACT.md).

| Nhóm | Method | Path | Mô tả |
|---|---|---|---|
| Auth | GET | `/auth/google`, `/auth/microsoft` | Bắt đầu đăng nhập |
| Auth | GET | `/auth/me` | Người dùng hiện tại |
| Auth | POST | `/auth/logout` | Đăng xuất |
| Lớp | GET/POST | `/classes` | Danh sách / tạo lớp |
| Lớp | PUT/DELETE | `/classes/:id` | Sửa / xóa lớp |
| Kỳ học phí | GET/POST | `/classes/:id/periods` | Danh sách / tạo kỳ của lớp |
| Kỳ học phí | POST | `/classes/:id/periods/generate` | Tạo nhanh 12 kỳ theo tháng |
| Kỳ học phí | PUT/DELETE | `/periods/:id` | Sửa / xóa kỳ |
| Học sinh | GET/POST | `/students` | Danh sách (lọc lớp, tìm tên) / thêm |
| Học sinh | PUT/DELETE | `/students/:id` | Sửa / xóa |
| Học sinh | POST | `/students/import` | Nhập danh sách học sinh |
| Học sinh | GET | `/students/export` | Xuất danh sách học sinh |
| Học phí | GET | `/tuition` | Bảng học phí theo quý (năm, quý 1-4; lọc lớp, trạng thái, tên) |
| Học phí | PATCH | `/tuition/payments/:id` | Tick / bỏ tick / ghi số tiền / ghi chú |
| Học phí | POST | `/tuition/payments/bulk-paid` | Đánh dấu nhiều khoản đã đóng |
| Học phí | POST | `/tuition/payments/bulk-enroll` | Thêm nhiều học sinh vào kỳ của một tháng |
| Học phí | POST | `/tuition/payments` | Thêm học sinh vào một kỳ |
| Học phí | DELETE | `/tuition/payments/:id` | Bỏ học sinh khỏi một kỳ |
| Dashboard | GET | `/dashboard` | Số liệu tổng hợp, biểu đồ, danh sách chưa đóng |
| Quá hạn | GET | `/overdue` | Danh sách khoản quá hạn |
| Nhập dữ liệu | GET | `/import/tuition/template` | Tải file mẫu |
| Nhập dữ liệu | POST | `/import/tuition` | Xem trước hoặc nhập file học phí (`commit=true`) |
| Báo cáo | GET | `/reports/students/export`, `/reports/tuition-summary/export`, `/reports/overdue/export` | Xuất Excel |
| Nhắc nhở | POST | `/reminders/run-now` | Chạy gửi email nhắc ngay |
| Hệ thống | POST | `/cron/reminders` | Dịch vụ hẹn giờ gọi hằng ngày (header `x-cron-secret`) |
| Hệ thống | GET | `/health` | Kiểm tra server còn sống |
