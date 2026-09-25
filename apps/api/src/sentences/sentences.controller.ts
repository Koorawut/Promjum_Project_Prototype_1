import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { SentencesService } from './sentences.service';

@Controller()
export class SentencesController {
  constructor(private readonly sentencesService: SentencesService) {}

  @Get('categories')
  @UseGuards(JwtAuthGuard)
  async listCategories(@CurrentUser() user: CurrentUserPayload) {
    return this.sentencesService.listCategories(user.userId);
  }
}
