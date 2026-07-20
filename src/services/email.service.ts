import nodemailer from "nodemailer";
import { AppError } from "../middlewares/error.middleware";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
});

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

export class EmailService {
  async sendPasswordResetEmail(to: string, userName: string, rawToken: string): Promise<void> {
    const resetUrl = `${FRONTEND_URL}/reset-password/${rawToken}`;

    const mailOptions = {
      from: `"Wase Workflow" <${process.env.EMAIL_USER}>`,
      to,
      subject: "Reset your password",
      html: `
        <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; color: #333;">
          <h2 style="color: #1a73e8; text-align: center;">Password Reset Request</h2>
          <p>Hello ${userName},</p>
          <p>We received a request to reset your password for your Wase Workflow account. Click the button below to set a new password:</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${resetUrl}"
               style="background-color: #1a73e8; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-size: 16px; font-weight: bold; display: inline-block;">
               Reset Password
            </a>
          </div>
          <p style="color: #888; font-size: 14px;">
            This link will expire in <strong>30 minutes</strong>. If you did not request a password reset, please ignore this email — your password will remain unchanged.
          </p>
          <p style="color: #888; font-size: 14px;">
            If the button above does not work, copy and paste this URL into your browser:
            <br />
            <a href="${resetUrl}">${resetUrl}</a>
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #aaa; font-size: 12px; text-align: center;">This is an automated email from Wase Workflow. Please do not reply.</p>
        </div>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`Password reset email sent to ${to}`);
    } catch (err: any) {
      console.error("Email send failed:", err.message);
      throw new AppError(500, "Unable to send reset email. Please try again later.");
    }
  }
}

export const emailService = new EmailService();
