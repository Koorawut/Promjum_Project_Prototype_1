import { Module } from '@nestjs/common';
import { AdminController, MediaController } from './admin.controller';
import { AdminService } from './admin.service';
import { MediaService } from './media.service';

@Module({
  controllers: [AdminController, MediaController],
  providers: [AdminService, MediaService],
})
export class AdminModule {}
