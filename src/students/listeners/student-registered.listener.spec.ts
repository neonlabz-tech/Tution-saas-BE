import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentRegisteredEvent } from '../events/student-registered.event.js';
import { StudentRegisteredListener } from './student-registered.listener.js';

describe('StudentRegisteredListener', () => {
  let listener: StudentRegisteredListener;
  let mockMailService: { sendStudentRegistrationEmail: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockMailService = {
      sendStudentRegistrationEmail: vi.fn().mockResolvedValue(undefined),
    };
    listener = new StudentRegisteredListener(mockMailService as never);
  });

  it('dispatches registration email via MailService', async () => {
    const event = new StudentRegisteredEvent(
      'STU-2026-001',
      'a1b2c3d4e5f6g7h8',
      'Nimal Perera',
      'nimal@mail.lk',
      '2025-A Morning',
      'pending',
      '2026-11-11',
      [{ id: 'mod_mth', code: 'MTH-101', name: 'Advanced Mathematics' }],
    );

    await listener.handleStudentRegistered(event);

    expect(mockMailService.sendStudentRegistrationEmail).toHaveBeenCalledWith(
      event,
    );
  });

  it('swallows and logs mail errors without throwing', async () => {
    mockMailService.sendStudentRegistrationEmail.mockRejectedValueOnce(
      new Error('SMTP down'),
    );

    const event = new StudentRegisteredEvent(
      'STU-2026-001',
      'a1b2c3d4e5f6g7h8',
      'Nimal Perera',
      'nimal@mail.lk',
      '2025-A Morning',
      'pending',
      '2026-11-11',
      [],
    );

    await expect(listener.handleStudentRegistered(event)).resolves.toBeUndefined();
  });
});
