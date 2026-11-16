import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getAuthConfig } from '../config/auth.config.js';

export interface SendPasswordResetMailOptions {
  to: string;
  fullName: string;
  resetUrl: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  async sendPasswordResetEmail(
    options: SendPasswordResetMailOptions,
  ): Promise<{ delivered: boolean }> {
    const { to, fullName, resetUrl } = options;
    const cfg = getAuthConfig(this.configService);

    if (!cfg.resendApiKey) {
      this.logger.warn(
        `[Resend API Key not set] Password reset link for ${to} (${fullName}): ${resetUrl}`,
      );
      return { delivered: false };
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: cfg.emailFrom,
          to: [to],
          subject: 'Reset your password - EduFlow',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
              <h2 style="color: #0f172a; margin-bottom: 16px;">Password Reset Request</h2>
              <p style="color: #334155; font-size: 15px; line-height: 1.5;">Hello ${fullName},</p>
              <p style="color: #334155; font-size: 15px; line-height: 1.5;">
                We received a request to reset the password for your administrator account on <strong>${cfg.instituteName}</strong>.
              </p>
              <div style="margin: 28px 0; text-align: center;">
                <a href="${resetUrl}" style="background-color: #6366f1; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
                  Reset Password
                </a>
              </div>
              <p style="color: #64748b; font-size: 13px; line-height: 1.4;">
                This link is valid for 1 hour. If you didn't request a password reset, you can safely ignore this email.
              </p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
              <p style="color: #94a3b8; font-size: 12px;">
                Button not working? Copy and paste this URL into your browser:<br />
                <a href="${resetUrl}" style="color: #6366f1; word-break: break-all;">${resetUrl}</a>
              </p>
            </div>
          `,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Resend API call failed (${response.status}): ${errorText}`,
        );
        return { delivered: false };
      }

      this.logger.log(`Password reset email sent to ${to} via Resend`);
      return { delivered: true };
    } catch (err) {
      this.logger.error(
        `Error sending password reset email to ${to}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { delivered: false };
    }
  }
}
