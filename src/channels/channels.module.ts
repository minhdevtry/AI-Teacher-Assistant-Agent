import { Module } from '@nestjs/common';
import { ZaloModule } from './zalo/zalo.module';

@Module({
  imports: [ZaloModule],
  exports: [ZaloModule],
})
export class ChannelsModule {}
