import nodemailer, { Transporter } from "nodemailer";
import env from "../config/env";

export type ReminderType = "due" | "overdue7" | "overdue15";

let transporter: Transporter | null = null;
let loggedMissingConfig = false;

function getTransporter(): Transporter | null {
  if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) {
    if (!loggedMissingConfig) {
      // eslint-disable-next-line no-console
      console.warn(
        "[email] Thiếu GMAIL_USER/GMAIL_APP_PASSWORD — email nhắc học phí sẽ không được gửi thực sự (chỉ ghi log)."
      );
      loggedMissingConfig = true;
    }
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: env.GMAIL_USER,
        pass: env.GMAIL_APP_PASSWORD,
      },
    });
  }

  return transporter;
}

function formatCurrencyVND(amount: number): string {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount);
}

function formatDateVN(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export interface ReminderEmailParams {
  studentName: string;
  className: string;
  periodName: string;
  year: number;
  amount: number;
  dueDate: Date;
  parentEmail: string;
  reminderType: ReminderType;
}

function buildEmailContent(params: ReminderEmailParams): { subject: string; html: string } {
  const { studentName, className, periodName, year, amount, dueDate, reminderType } = params;
  const amountText = formatCurrencyVND(amount);
  const dueDateText = formatDateVN(dueDate);
  const periodText = `${periodName.toLowerCase()}/${year}`;

  const baseStyle = `font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #1f2937; line-height: 1.6;`;
  const wrap = (title: string, bodyHtml: string, color: string) => `
    <div style="${baseStyle} max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <h2 style="color: ${color}; margin-top: 0;">${title}</h2>
      ${bodyHtml}
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="font-size: 13px; color: #6b7280;">
        Đây là email tự động từ Hệ thống Quản lý Học phí. Vui lòng không phản hồi trực tiếp email này.
        Nếu quý phụ huynh có thắc mắc, xin liên hệ trực tiếp giáo viên chủ nhiệm.
      </p>
    </div>
  `;

  if (reminderType === "due") {
    return {
      subject: `[Nhắc học phí] Đến hạn đóng học phí ${periodText} — ${studentName}`,
      html: wrap(
        "Thông báo đến hạn đóng học phí",
        `
          <p>Kính gửi Quý phụ huynh,</p>
          <p>Học phí ${periodText} của em <strong>${studentName}</strong> (lớp <strong>${className}</strong>) đã đến hạn thanh toán.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr><td style="padding: 6px 0; color: #6b7280;">Số tiền cần đóng:</td><td style="padding: 6px 0; font-weight: bold;">${amountText}</td></tr>
            <tr><td style="padding: 6px 0; color: #6b7280;">Hạn đóng:</td><td style="padding: 6px 0; font-weight: bold;">${dueDateText}</td></tr>
          </table>
          <p>Kính mong Quý phụ huynh sắp xếp đóng học phí đúng hạn. Xin chân thành cảm ơn!</p>
        `,
        "#2563eb"
      ),
    };
  }

  if (reminderType === "overdue7") {
    return {
      subject: `[Nhắc học phí] Quá hạn 7 ngày — học phí ${periodText} của ${studentName}`,
      html: wrap(
        "Nhắc nhở: Học phí đã quá hạn 7 ngày",
        `
          <p>Kính gửi Quý phụ huynh,</p>
          <p>Học phí ${periodText} của em <strong>${studentName}</strong> (lớp <strong>${className}</strong>) hiện đã quá hạn thanh toán <strong>7 ngày</strong> (hạn đóng: ${dueDateText}).</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr><td style="padding: 6px 0; color: #6b7280;">Số tiền còn thiếu:</td><td style="padding: 6px 0; font-weight: bold; color: #ea580c;">${amountText}</td></tr>
          </table>
          <p>Kính mong Quý phụ huynh sớm hoàn tất việc đóng học phí. Xin chân thành cảm ơn!</p>
        `,
        "#ea580c"
      ),
    };
  }

  // overdue15
  return {
    subject: `[Nhắc học phí - Khẩn] Quá hạn 15 ngày — học phí ${periodText} của ${studentName}`,
    html: wrap(
      "Nhắc nhở khẩn: Học phí đã quá hạn 15 ngày",
      `
        <p>Kính gửi Quý phụ huynh,</p>
        <p>Học phí ${periodText} của em <strong>${studentName}</strong> (lớp <strong>${className}</strong>) hiện đã quá hạn thanh toán <strong>15 ngày</strong> (hạn đóng: ${dueDateText}) mà vẫn chưa được thanh toán.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 6px 0; color: #6b7280;">Số tiền còn thiếu:</td><td style="padding: 6px 0; font-weight: bold; color: #dc2626;">${amountText}</td></tr>
        </table>
        <p>Kính mong Quý phụ huynh vui lòng thanh toán sớm nhất có thể hoặc liên hệ giáo viên để trao đổi thêm. Xin chân thành cảm ơn!</p>
      `,
      "#dc2626"
    ),
  };
}

/**
 * Sends a reminder email via Nodemailer/Gmail SMTP. If Gmail credentials
 * are not configured, logs the would-be email instead of throwing, so local
 * development / testing is not blocked.
 */
export async function sendReminderEmail(params: ReminderEmailParams): Promise<void> {
  const { subject, html } = buildEmailContent(params);
  const t = getTransporter();

  if (!t) {
    // eslint-disable-next-line no-console
    console.log(`[email:DRY-RUN] Đến: ${params.parentEmail} | Chủ đề: ${subject}`);
    return;
  }

  await t.sendMail({
    from: `"Hệ thống Quản lý Học phí" <${env.GMAIL_USER}>`,
    to: params.parentEmail,
    subject,
    html,
  });
}

export default { sendReminderEmail };
