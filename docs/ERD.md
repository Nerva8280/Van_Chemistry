# Sơ đồ quan hệ thực thể (ERD)

```mermaid
erDiagram
    USER ||--o{ CLASS : "sở hữu"
    CLASS ||--o{ STUDENT : "chứa"
    STUDENT ||--o{ TUITION_PAYMENT : "có"
    STUDENT ||--o{ REMINDER_LOG : "nhận"

    USER {
        uuid id PK
        string email UK
        string name
        string avatarUrl
        string provider
        string providerId
        datetime createdAt
    }

    CLASS {
        uuid id PK
        string name
        decimal defaultTuitionFee
        uuid userId FK
        datetime createdAt
    }

    STUDENT {
        uuid id PK
        string fullName
        uuid classId FK
        string parentEmail
        string parentPhone
        decimal monthlyTuitionFee
        boolean active
        datetime createdAt
    }

    TUITION_PAYMENT {
        uuid id PK
        uuid studentId FK
        int year
        int month
        boolean isPaid
        datetime paidDate
        decimal amount
        datetime dueDate
        datetime createdAt
        datetime updatedAt
    }

    REMINDER_LOG {
        uuid id PK
        uuid studentId FK
        int year
        int month
        string reminderType
        datetime sentAt
    }
```

Ràng buộc duy nhất quan trọng:
- `TUITION_PAYMENT`: unique `(studentId, year, month)` — mỗi học sinh chỉ có một bản ghi học phí cho mỗi tháng/năm.
- `REMINDER_LOG`: unique `(studentId, year, month, reminderType)` — tránh gửi trùng cùng một loại nhắc nhở cho cùng kỳ học phí.

Xem schema Prisma đầy đủ và SQL thô tương ứng tại [DATABASE.sql](DATABASE.sql) và `backend/prisma/schema.prisma`.
