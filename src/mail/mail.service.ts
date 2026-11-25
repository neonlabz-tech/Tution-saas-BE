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
    const frontendUrl = (
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5714'
    ).replace(/\/+$/, '');
    const studentLoginUrl = `${frontendUrl}/student/login`;
    const qrPayload = `EDUFLOW:${payload.ref}`;
    const maskedRef = `${payload.ref.slice(0, 6)}...`;

    const moduleNames =
      payload.modules.length > 0
        ? payload.modules.map((mod) => `${mod.code} — ${mod.name}`)
        : ['No modules listed'];

    const subject = `Welcome to ${instituteName} — Student Registration (${payload.studentId})`;

    const credentialsText = payload.temporaryPassword
      ? [
          '',
          'Student Portal Login Credentials:',
          `Login URL: ${studentLoginUrl}`,
          `Username / Email: ${payload.email}`,
          `Temporary Password: ${payload.temporaryPassword}`,
          'Please sign in via the link above to set your preferred personal password.',
          '',
        ]
      : [
          '',
          'Student Portal Login:',
          `Login URL: ${studentLoginUrl}`,
          'Once your registration is verified, you can sign in using your registered email and the password you chose during registration.',
          '',
        ];

    const text = [
      `Hello ${payload.fullName},`,
      '',
      `Welcome to ${instituteName} (${appName})! Your student registration has been recorded.`,
      '',
      `Student ID: ${payload.studentId}`,
      `Batch: ${payload.batch}`,
      `Enrollment Date: ${payload.enrollmentDate}`,
      `Current Status: ${payload.status}`,
      ...credentialsText,
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

    const credentialsHtml = payload.temporaryPassword
      ? `
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:18px 0;">
          <p style="margin:0 0 8px;font-weight:bold;color:#166534;font-size:15px;">Student Portal Credentials</p>
          <p style="margin:0 0 6px;font-size:13px;color:#1e293b;">
            Your student portal account has been created. Use the credentials below to log in:
          </p>
          <table style="width:100%;border-collapse:collapse;margin:10px 0;font-size:13px;">
            <tr>
              <td style="padding:6px 0;font-weight:bold;color:#475569;width:140px;">Portal URL:</td>
              <td style="padding:6px 0;"><a href="${studentLoginUrl}" style="color:#4f46e5;font-weight:bold;">${studentLoginUrl}</a></td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-weight:bold;color:#475569;">Username (Email):</td>
              <td style="padding:6px 0;font-family:monospace;color:#0f172a;">${this.escapeHtml(payload.email)}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-weight:bold;color:#475569;">Temporary Password:</td>
              <td style="padding:6px 0;font-family:monospace;font-weight:bold;color:#0f172a;">${this.escapeHtml(payload.temporaryPassword)}</td>
            </tr>
          </table>
          <p style="margin:8px 0 0;font-size:12px;color:#15803d;">
            Tip: Click the portal link above to log in and set your personal password.
          </p>
        </div>
      `
      : `
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:18px;margin:18px 0;text-align:center;">
          <p style="margin:0 0 12px;font-size:14px;color:#334155;">
            Once your account is verified by the administration, you can sign in with your email and the password you chose during registration:
          </p>
          <div style="margin:14px 0;">
            <a href="${studentLoginUrl}" style="background-color:#4f46e5;color:#ffffff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;font-size:14px;">
              Go to Student Portal Login
            </a>
          </div>
          <p style="margin:10px 0 0;font-size:12px;color:#64748b;">
            Login URL: <a href="${studentLoginUrl}" style="color:#4f46e5;">${studentLoginUrl}</a>
          </p>
        </div>
      `;

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
          ${credentialsHtml}
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

    try {
      this.logger.log(
        `[STUDENT REGISTRATION CREDENTIALS] Email: ${payload.email} | ID: ${payload.studentId} | Password: ${payload.temporaryPassword || '(not set)'} | Portal: ${studentLoginUrl}`,
      );

      await this.deliverEmail({
        to: payload.email,
        fullName: payload.fullName,
        subject,
        html,
        text,
      });

      this.logger.log(
        `Registration email dispatched to ${payload.email} for ${payload.studentId}`,
      );
    } catch (err) {
      this.logger.warn(
        `Could not send registration email via Resend to ${payload.email}: ${err}. ` +
          `Notice: If using the free Resend test domain (onboarding@resend.dev), Resend strictly permits delivery ONLY to kajaluxmyneonlabz@gmail.com. ` +
          `Credentials for ${payload.email}: Student ID: ${payload.studentId}, Password: ${payload.temporaryPassword}, Login: ${studentLoginUrl}`,
      );
    }
  }

  async sendStudentVerificationEmail(options: {
    to: string;
    fullName: string;
    studentId: string;
  }): Promise<void> {
    const instituteName = this.configService.get<string>(
      'INSTITUTE_NAME',
      'Bright Future Institute',
    );
    const frontendUrl = (
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5714'
    ).replace(/\/+$/, '');
    const loginUrl = `${frontendUrl}/student/login`;

    const subject = `Account Approved — ${instituteName} Student Portal`;
    const text = [
      `Hello ${options.fullName},`,
      '',
      `Great news! Your student registration (${options.studentId}) has been verified and approved by ${instituteName}.`,
      '',
      `You can now log in to the Student Portal using your email and password at:`,
      loginUrl,
      '',
      `Regards,`,
      `${instituteName}`,
    ].join('\n');

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
        <h2 style="color:#0f172a;margin-top:0;">Account Verified & Approved 🎉</h2>
        <p style="color:#334155;font-size:15px;line-height:1.5;">Hello <strong>${this.escapeHtml(options.fullName)}</strong>,</p>
        <p style="color:#334155;font-size:15px;line-height:1.5;">
          Your student registration (<strong>${this.escapeHtml(options.studentId)}</strong>) at <strong>${this.escapeHtml(instituteName)}</strong> has been verified and approved by the administration.
        </p>
        <p style="color:#334155;font-size:15px;line-height:1.5;">
          You can now log in to access your modules, schedule, assignments, and payments.
        </p>
        <div style="margin:28px 0;text-align:center;">
          <a href="${loginUrl}" style="background-color:#4f46e5;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
            Sign in to Student Portal
          </a>
        </div>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="color:#94a3b8;font-size:12px;">
          Login URL: <a href="${loginUrl}" style="color:#4f46e5;">${loginUrl}</a>
        </p>
      </div>
    `;

    try {
      await this.deliverEmail({
        to: options.to,
        fullName: options.fullName,
        subject,
        html,
        text,
      });
      this.logger.log(`Verification email sent to ${options.to}`);
    } catch (err) {
      this.logger.warn(`Could not send verification email: ${err}`);
    }
  }

  private async deliverEmail(options: {
    to: string;
    fullName?: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    const resendApiKey = (
      this.configService.get<string>('RESEND_API_KEY') ||
      this.configService.get<string>('MAIL_PASS')
    )?.trim();
    const from = (
      this.configService.get<string>('MAIL_FROM') ||
      this.configService.get<string>('EMAIL_FROM') ||
      'EduFlow <onboarding@resend.dev>'
    ).trim();

    if (resendApiKey) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: [options.to],
            subject: options.subject,
            html: options.html,
            text: options.text,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Resend API HTTP ${response.status}: ${errText}`);
        }

        const data = (await response.json()) as { id?: string };
        this.logger.log(
          `Email "${options.subject}" delivered via Resend to ${options.to} (ID: ${data?.id ?? 'ok'})`,
        );
        return;
      } catch (err) {
        this.logger.warn(`Direct Resend dispatch failed: ${err}. Attempting fallback...`);
      }
    }

    await this.mailer.send({
      to: options.fullName ? { name: options.fullName, address: options.to } : options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    this.logger.log(`Email "${options.subject}" sent via mailer transport to ${options.to}`);
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
