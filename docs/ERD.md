# Sơ đồ quan hệ thực thể (ERD)

```mermaid
erDiagram
    USER ||--o{ CLASS : "sở hữu"
    CLASS ||--o{ STUDENT : "chứa"
    CLASS ||--o{ TUITION_PERIOD : "có các kỳ"
    STUDENT ||--o{ TUITION_PAYMENT : "có"
    TUITION_PERIOD ||--o{ TUITION_PAYMENT : "gồm"
    TUITION_PAYMENT ||--o{ REMINDER_LOG : "được nhắc"

    USER {
        uuid id PK
        string email UK
        string name
        string provider
        string providerId
    }

    CLASS {
        uuid id PK
        string name
        string sheetName "sheet nguồn khi nhập Excel"
        decimal defaultTuitionFee
        uuid userId FK
    }

    STUDENT {
        uuid id PK
        int stt "STT trong file gốc"
        string fullName
        uuid classId FK
        string parentEmail
        string parentPhone
        decimal monthlyTuitionFee "học phí dự kiến mỗi kỳ"
        boolean active
    }

    TUITION_PERIOD {
        uuid id PK
        uuid classId FK
        string name "vd: Tháng 7"
        int year
        int month "1-12, để xếp cột giữa các lớp"
        datetime startDate
        datetime endDate
        datetime dueDate "hạn đóng"
    }

    TUITION_PAYMENT {
        uuid id PK
        uuid studentId FK
        uuid periodId FK
        decimal expectedAmount
        decimal paidAmount
        boolean isPaid
        datetime paidDate "null = không rõ / chưa đóng"
        string note
        datetime updatedAt
    }

    REMINDER_LOG {
        uuid id PK
        uuid studentId FK
        uuid paymentId FK
        string reminderType "due | overdue7 | overdue15"
        datetime sentAt
    }
```

Ràng buộc quan trọng:
- `TUITION_PERIOD`: unique `(classId, year, month)`, mỗi lớp có tối đa một kỳ cho một tháng.
- `TUITION_PAYMENT`: unique `(studentId, periodId)`. **Không có bản ghi nghĩa là học sinh không học kỳ đó** (ô "—");
  bản ghi có `paidAmount = 0` nghĩa là có học nhưng chưa đóng.
- `REMINDER_LOG`: unique `(paymentId, reminderType)`, để không gửi trùng email nhắc.
- Xóa lớp → xóa các kỳ; xóa kỳ hoặc học sinh → xóa các khoản học phí liên quan.

Trạng thái hiển thị (tính khi đọc, không lưu): Đã đóng (`isPaid`), Đóng một phần (`paidAmount > 0`),
Quá hạn (chưa đóng đồng nào và `dueDate` đã qua), Chưa đóng.

SQL tương ứng: [DATABASE.sql](DATABASE.sql).
