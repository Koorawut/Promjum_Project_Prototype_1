import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { GameService } from './game.service';

@Controller('game')
@UseGuards(JwtAuthGuard)
export class GameController {
  constructor(private readonly gameService: GameService) {}

  @Get('summary/:matchId')
  async getSummary(@CurrentUser() user: CurrentUserPayload, @Param('matchId') matchId: string) {
    return this.gameService.getSummary(user.userId, matchId);
  }
}
