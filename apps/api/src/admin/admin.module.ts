import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { MediaService } from './media.service';

@Module({
  controllers: [AdminController],
  providers: [AdminService, MediaService],
})
export class AdminModule {}
