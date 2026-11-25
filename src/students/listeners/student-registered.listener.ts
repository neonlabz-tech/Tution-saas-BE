import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MailService } from '../../mail/mail.service.js';
import { StudentRegisteredEvent } from '../events/student-registered.event.js';

@Injectable()
export class StudentRegisteredListener {
  private readonly logger = new Logger(StudentRegisteredListener.name);

  constructor(private readonly mailService: MailService) {}

  @OnEvent('student.registered', { async: true })
  async handleStudentRegistered(event: StudentRegisteredEvent): Promise<void> {
    // If the student registered themselves, only send an email after admin verification
    if (event.isSelfRegistered) {
      this.logger.log(
        `Student ${event.studentId} (${event.email}) self-registered. Registration email withheld until admin verifies the account.`,
      );
      return;
    }

    try {
      await this.mailService.sendStudentRegistrationEmail(event);
    } catch (error) {
      this.logger.error(
        `Failed to send registration email for ${event.studentId} (${event.email})`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
