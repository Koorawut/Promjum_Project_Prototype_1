import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { EMAIL_SERVICE } from './email/email.service.interface';
import { ConsoleEmailService } from './email/console-email.service';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    GoogleStrategy,
    { provide: EMAIL_SERVICE, useClass: ConsoleEmailService },
  ],
  exports: [AuthService],
})
export class AuthModule {}
