export interface EmailService {
  sendVerificationEmail(to: string, link: string): Promise<void>;
}

export const EMAIL_SERVICE = 'EMAIL_SERVICE';
