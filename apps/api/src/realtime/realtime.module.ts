import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeGateway } from './realtime.gateway';
import { MatchmakingQueueService } from './matchmaking-queue.service';
import { MatchRuntimeService } from './match-runtime.service';

@Module({
  imports: [JwtModule.register({})],
  providers: [RealtimeGateway, MatchmakingQueueService, MatchRuntimeService],
})
export class RealtimeModule {}
