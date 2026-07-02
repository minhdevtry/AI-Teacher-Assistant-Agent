import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { ZaloService } from './zalo.service';
import { ZaloAdapter } from './zalo.adapter';
import { ZaloController } from './zalo.controller';
import { ZaloPollingService } from './zalo-polling.service';
import { ChannelRegistryService } from '../common';

/**
 * Zalo channel module.
 * Registers the Zalo adapter in the global ChannelRegistry on init.
 */
@Module({
  controllers: [ZaloController],
  providers: [
    ZaloService,
    ZaloAdapter,
    ZaloPollingService,
    ChannelRegistryService,
  ],
  exports: [ZaloService, ZaloAdapter, ChannelRegistryService],
})
export class ZaloModule implements OnModuleInit {
  private readonly logger = new Logger(ZaloModule.name);

  constructor(
    private readonly zaloAdapter: ZaloAdapter,
    private readonly channelRegistry: ChannelRegistryService,
  ) {}

  onModuleInit(): void {
    this.channelRegistry.register(this.zaloAdapter.getPlatform(), this.zaloAdapter);
    this.logger.log('ZaloAdapter registered in ChannelRegistry');
  }
}
