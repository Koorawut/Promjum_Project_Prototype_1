import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PracticeController } from './practice.controller';
import { PracticeService } from './practice.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [PracticeController],
  providers: [PracticeService],
})
export class PracticeModule {}
