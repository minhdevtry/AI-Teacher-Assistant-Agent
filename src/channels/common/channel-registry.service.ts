import { Injectable, Logger } from '@nestjs/common';
import { ChannelAdapter } from './channel.adapter';

/**
 * Registry that holds all registered channel adapters.
 * Adapters self-register during module initialization.
 */
@Injectable()
export class ChannelRegistryService {
  private readonly logger = new Logger(ChannelRegistryService.name);
  private readonly adapters = new Map<string, ChannelAdapter>();

  /**
   * Register a channel adapter for a given platform.
   * Throws if an adapter for the same platform is already registered.
   */
  register(platform: string, adapter: ChannelAdapter): void {
    if (this.adapters.has(platform)) {
      this.logger.warn(
        `Adapter for platform "${platform}" is already registered. Overwriting.`,
      );
    }
    this.adapters.set(platform, adapter);
    this.logger.log(`Registered channel adapter: ${platform}`);
  }

  /**
   * Retrieve the adapter for a given platform.
   * Throws if no adapter is registered for the platform.
   */
  get(platform: string): ChannelAdapter {
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new Error(`No adapter registered for platform: ${platform}`);
    }
    return adapter;
  }

  /**
   * Return all registered adapters.
   */
  getAll(): ChannelAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Check if an adapter exists for the given platform.
   */
  has(platform: string): boolean {
    return this.adapters.has(platform);
  }
}
