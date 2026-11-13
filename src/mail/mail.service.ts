import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Mailer } from '@nestjs/mail';
import type { StudentRegisteredEvent } from '../students/events/student-registered.event.js';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly mailer: Mailer,
    private readonly configService: ConfigService,
  ) {}

  async sendStudentRegistrationEmail(
    payload: StudentRegisteredEvent,
  ): Promise<void> {
    const instituteName = this.configService.get<string>(
      'INSTITUTE_NAME',
      'Bright Future Institute',
    );
    const appName = this.configService.get<string>('APP_NAME', 'EduFlow');
    const qrPayload = `EDUFLOW:${payload.ref}`;
    const maskedRef = `${payload.ref.slice(0, 6)}...`;

    const moduleNames =
      payload.modules.length > 0
        ? payload.modules.map((mod) => `${mod.code} — ${mod.name}`)
        : ['No modules listed'];

    const subject = `Welcome to ${instituteName} — Student Registration (${payload.studentId})`;

    const text = [
      `Hello ${payload.fullName},`,
      '',
      `Welcome to ${instituteName} (${appName})! Your student registration has been recorded.`,
      '',
      `Student ID: ${payload.studentId}`,
      `Batch: ${payload.batch}`,
      `Enrollment Date: ${payload.enrollmentDate}`,
      `Current Status: ${payload.status}`,
      '',
      'Registered Modules:',
      ...moduleNames.map((name) => `- ${name}`),
      '',
      'QR Card & Onboarding Details:',
      `Your digital ${appName} QR card has been provisioned for front-desk attendance and payment verification.`,
      `QR Reference: ${maskedRef}`,
      `QR Payload: ${qrPayload}`,
      'Please keep your QR card private and present it when checking in at the institute.',
      '',
      `Regards,`,
      `${instituteName}`,
    ].join('\n');

    const moduleListHtml = moduleNames
      .map(
        (name) =>
          `<li style="margin:4px 0;color:#1e293b;">${this.escapeHtml(name)}</li>`,
      )
      .join('');

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8fafc;">
        <div style="background:#312e81;padding:24px;border-radius:12px 12px 0 0;color:#ffffff;">
          <h1 style="margin:0;font-size:22px;">${this.escapeHtml(instituteName)}</h1>
          <p style="margin:6px 0 0;font-size:13px;opacity:0.85;">${this.escapeHtml(appName)} · Student Onboarding</p>
        </div>
        <div style="background:#ffffff;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
          <p style="margin-top:0;color:#0f172a;">Hello <strong>${this.escapeHtml(payload.fullName)}</strong>,</p>
          <p style="color:#334155;line-height:1.6;">
            Your student registration at <strong>${this.escapeHtml(instituteName)}</strong> has been received.
          </p>
          <table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:14px;">
            <tr style="background:#f8fafc;">
              <td style="padding:10px;border:1px solid #e2e8f0;font-weight:bold;color:#475569;">Student ID</td>
              <td style="padding:10px;border:1px solid #e2e8f0;color:#0f172a;font-family:monospace;">${this.escapeHtml(payload.studentId)}</td>
            </tr>
            <tr>
              <td style="padding:10px;border:1px solid #e2e8f0;font-weight:bold;color:#475569;">Batch</td>
              <td style="padding:10px;border:1px solid #e2e8f0;color:#0f172a;">${this.escapeHtml(payload.batch)}</td>
            </tr>
            <tr style="background:#f8fafc;">
              <td style="padding:10px;border:1px solid #e2e8f0;font-weight:bold;color:#475569;">Enrollment Date</td>
              <td style="padding:10px;border:1px solid #e2e8f0;color:#0f172a;">${this.escapeHtml(payload.enrollmentDate)}</td>
            </tr>
            <tr>
              <td style="padding:10px;border:1px solid #e2e8f0;font-weight:bold;color:#475569;">Current Status</td>
              <td style="padding:10px;border:1px solid #e2e8f0;color:#0f172a;text-transform:capitalize;">${this.escapeHtml(payload.status)}</td>
            </tr>
          </table>
          <h3 style="margin:18px 0 8px;font-size:14px;color:#0f172a;">Registered Modules</h3>
          <ul style="margin:0 0 18px;padding-left:20px;">${moduleListHtml}</ul>
          <div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:16px;margin:18px 0;">
            <p style="margin:0 0 6px;font-weight:bold;color:#312e81;">QR Card &amp; Onboarding Details</p>
            <p style="margin:0 0 6px;font-size:13px;color:#334155;">
              Your opaque ${this.escapeHtml(appName)} QR reference (<strong>${this.escapeHtml(maskedRef)}</strong>) has been generated for front-desk attendance and payments.
            </p>
            <p style="margin:0;font-size:12px;color:#475569;font-family:monospace;">
              QR Payload: ${this.escapeHtml(qrPayload)}
            </p>
          </div>
          <p style="margin:18px 0 0;font-size:13px;color:#64748b;">
            Please present your student QR card at the front desk during classes.<br />
            — ${this.escapeHtml(instituteName)}
          </p>
        </div>
      </div>
    `;

    await this.mailer.send({
      to: { name: payload.fullName, address: payload.email },
      subject,
      html,
      text,
    });

    this.logger.log(
      `Registration email dispatched to ${payload.email} for ${payload.studentId}`,
    );
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
}
