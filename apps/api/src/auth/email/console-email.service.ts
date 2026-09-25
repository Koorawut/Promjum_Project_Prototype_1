import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from './email.service.interface';

@Injectable()
export class ConsoleEmailService implements EmailService {
  private readonly logger = new Logger(ConsoleEmailService.name);

  async sendVerificationEmail(to: string, link: string): Promise<void> {
    this.logger.log(`[email-stub] verification link for ${to}: ${link}`);
  }
}
