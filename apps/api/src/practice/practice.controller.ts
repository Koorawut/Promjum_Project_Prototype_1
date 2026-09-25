import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { PracticeService } from './practice.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { CompleteSentenceDto } from './dto/complete-sentence.dto';

@Controller('practice')
@UseGuards(JwtAuthGuard)
export class PracticeController {
  constructor(private readonly practiceService: PracticeService) {}

  @Post('session')
  async createSession(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateSessionDto) {
    return this.practiceService.createSession(user.userId, dto);
  }

  @Get('session/:id')
  async getSession(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.practiceService.getSession(user.userId, id);
  }

  @Post('session/:id/complete-sentence')
  async completeSentence(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: CompleteSentenceDto,
  ) {
    return this.practiceService.completeSentence(user.userId, id, dto.sentenceId, dto.selectedOptionKey);
  }
}
