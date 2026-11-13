import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentRegisteredEvent } from '../students/events/student-registered.event.js';
import { MailService } from './mail.service.js';

describe('MailService', () => {
  let service: MailService;
  let mockMailer: { send: ReturnType<typeof vi.fn> };
  let mockConfigService: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockMailer = {
      send: vi.fn().mockResolvedValue({ messageId: 'msg-123' }),
    };

    mockConfigService = {
      get: vi.fn((key: string, defaultValue?: string) => {
        if (key === 'INSTITUTE_NAME') return 'Bright Future Institute';
        if (key === 'APP_NAME') return 'EduFlow';
        return defaultValue;
      }),
    };

    service = new MailService(
      mockMailer as never,
      mockConfigService as unknown as ConfigService,
    );
  });

  it('sends registration email with HTML and plain text content including student and QR details', async () => {
    const event = new StudentRegisteredEvent(
      'STU-2026-001',
      'a1b2c3d4e5f6g7h8',
      'Nimal <Perera>',
      'nimal@mail.lk',
      '2025-A Morning',
      'pending',
      '2026-11-11',
      [
        { id: 'mod_mth', code: 'MTH-101', name: 'Advanced Mathematics' },
        { id: 'mod_phy', code: 'PHY-102', name: 'Physics' },
      ],
    );

    await service.sendStudentRegistrationEmail(event);

    expect(mockMailer.send).toHaveBeenCalledTimes(1);
    const payload = mockMailer.send.mock.calls[0][0];

    expect(payload.to).toEqual({
      name: 'Nimal <Perera>',
      address: 'nimal@mail.lk',
    });
    expect(payload.subject).toContain('Bright Future Institute');
    expect(payload.subject).toContain('STU-2026-001');

    // Plain text assertions
    expect(payload.text).toContain('Bright Future Institute');
    expect(payload.text).toContain('Nimal <Perera>');
    expect(payload.text).toContain('STU-2026-001');
    expect(payload.text).toContain('2025-A Morning');
    expect(payload.text).toContain('MTH-101 — Advanced Mathematics');
    expect(payload.text).toContain('PHY-102 — Physics');
    expect(payload.text).toContain('pending');
    expect(payload.text).toContain('EDUFLOW:a1b2c3d4e5f6g7h8');

    // HTML assertions (including XSS escaping)
    expect(payload.html).toContain('Bright Future Institute');
    expect(payload.html).toContain('Nimal &lt;Perera&gt;');
    expect(payload.html).toContain('STU-2026-001');
    expect(payload.html).toContain('2025-A Morning');
    expect(payload.html).toContain('MTH-101 — Advanced Mathematics');
    expect(payload.html).toContain('EDUFLOW:a1b2c3d4e5f6g7h8');
  });

  it('propagates transport failure so async listener can handle it', async () => {
    mockMailer.send.mockRejectedValueOnce(new Error('SMTP connection timeout'));

    const event = new StudentRegisteredEvent(
      'STU-2026-002',
      'z9y8x7w6v5u4t3s2',
      'Kasun Silva',
      'kasun@mail.lk',
      '2025-B Evening',
      'pending',
      '2026-11-11',
      [{ id: 'mod_mth', code: 'MTH-101', name: 'Advanced Mathematics' }],
    );

    await expect(service.sendStudentRegistrationEmail(event)).rejects.toThrow(
      'SMTP connection timeout',
    );
  });
});
