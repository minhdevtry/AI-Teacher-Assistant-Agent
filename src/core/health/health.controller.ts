import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SupabaseService } from '../../integrations/supabase/supabase.service';

@ApiTags('Health')
@Controller('api/health')
export class HealthController {
  constructor(
    @Inject(SupabaseService)
    private readonly supabaseService: SupabaseService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Health check — verifies app and Supabase connectivity' })
  @ApiResponse({ status: 200, description: 'All systems operational' })
  @ApiResponse({ status: 503, description: 'Supabase connection failed' })
  async check() {
    const start = Date.now();
    let supabaseStatus = 'ok';

    try {
      const client = this.supabaseService.getClient();
      const { error } = await client.from('User').select('Id').limit(1);
      if (error) {
        supabaseStatus = `error: ${error.message}`;
      }
    } catch (err) {
      supabaseStatus = `error: ${(err as Error).message}`;
    }

    const latency = Date.now() - start;

    return {
      status: supabaseStatus === 'ok' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      latency: `${latency}ms`,
      supabase: supabaseStatus,
    };
  }
}
