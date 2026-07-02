import { Controller, Get, Post, Body, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { GoogleSheetsService } from './google-sheets.service';

@ApiTags('Google Sheets')
@Controller('api/sheets')
export class GoogleSheetsController {
  private readonly logger = new Logger(GoogleSheetsController.name);

  constructor(
    private readonly googleSheetsService: GoogleSheetsService,
    private readonly configService: ConfigService,
  ) {}

  @Post('sync')
  @ApiOperation({ summary: 'Trigger manual sync to Google Sheets' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        entityType: {
          type: 'string',
          enum: ['payment', 'invoice', 'student'],
          description: 'Entity type to sync. Omit for full sync.',
        },
        billingMonth: {
          type: 'string',
          description: 'Billing month filter (YYYY-MM format)',
        },
        classCode: {
          type: 'string',
          description: 'Class code filter',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Sync completed' })
  @ApiResponse({ status: 500, description: 'Sync failed' })
  async sync(@Body() body: { entityType?: string; billingMonth?: string; classCode?: string }) {
    const results: Record<string, { synced: number }> = {};

    switch (body.entityType) {
      case 'payment':
        results.payments = await this.googleSheetsService.syncPayments(body.billingMonth);
        break;
      case 'invoice':
        results.invoices = await this.googleSheetsService.syncInvoices(body.classCode);
        break;
      case 'student':
        results.students = await this.googleSheetsService.syncStudents(body.classCode);
        break;
      default:
        results.payments = await this.googleSheetsService.syncPayments(body.billingMonth);
        results.invoices = await this.googleSheetsService.syncInvoices(body.classCode);
        results.students = await this.googleSheetsService.syncStudents(body.classCode);
    }

    this.logger.log(`Manual sync completed: ${JSON.stringify(results)}`);

    return {
      success: true,
      data: results,
      message: 'Sync completed',
    };
  }

  @Get('status')
  @ApiOperation({ summary: 'Get Google Sheets sync status' })
  @ApiResponse({ status: 200, description: 'Current sync status' })
  async status() {
    return {
      success: true,
      data: {
        configured: !!(
          this.configService.get<string>('GOOGLE_SHEETS_CLIENT_EMAIL') &&
          this.configService.get<string>('GOOGLE_SHEETS_PRIVATE_KEY') &&
          this.configService.get<string>('GOOGLE_SHEETS_SHEET_ID')
        ),
        lastSync: null,
      },
      message: 'Status retrieved',
    };
  }
}
