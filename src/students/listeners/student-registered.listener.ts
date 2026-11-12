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
