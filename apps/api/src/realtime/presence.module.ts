import { Module } from '@nestjs/common';
import { PresenceService } from './presence.service';

// Split out from RealtimeModule so AuthModule (a plain HTTP module) can
// push force-logout notices to a user's live socket without importing the
// whole realtime/gateway module graph.
@Module({
  providers: [PresenceService],
  exports: [PresenceService],
})
export class PresenceModule {}
