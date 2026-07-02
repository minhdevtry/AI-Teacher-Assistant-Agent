import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, sheets_v4 } from 'googleapis';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class GoogleSheetsService implements OnModuleInit {
  private readonly logger = new Logger(GoogleSheetsService.name);
  private sheetsClient!: sheets_v4.Sheets;
  private sheetId!: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseService: SupabaseService,
  ) {}

  onModuleInit() {
    const clientEmail = this.configService.get<string>('GOOGLE_SHEETS_CLIENT_EMAIL');
    const privateKey = this.configService.get<string>('GOOGLE_SHEETS_PRIVATE_KEY');
    this.sheetId = this.configService.get<string>('GOOGLE_SHEETS_SHEET_ID') ?? '';

    if (!clientEmail || !privateKey || !this.sheetId) {
      this.logger.warn(
        'Google Sheets credentials not configured. Sync operations will be unavailable.',
      );
      return;
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheetsClient = google.sheets({ version: 'v4', auth });
    this.logger.log('Google Sheets client initialized');
  }

  private ensureClient(): sheets_v4.Sheets {
    if (!this.sheetsClient) {
      throw new Error('Google Sheets client not initialized. Check credentials.');
    }
    return this.sheetsClient;
  }

  async appendRows(sheetName: string, rows: unknown[][]): Promise<void> {
    const client = this.ensureClient();
    await client.spreadsheets.values.append({
      spreadsheetId: this.sheetId,
      range: sheetName,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows },
    });
    this.logger.log(`Appended ${rows.length} rows to sheet "${sheetName}"`);
  }

  async clearAndWrite(sheetName: string, rows: unknown[][]): Promise<void> {
    const client = this.ensureClient();

    await client.spreadsheets.values.clear({
      spreadsheetId: this.sheetId,
      range: sheetName,
    });

    if (rows.length === 0) {
      this.logger.log(`Cleared sheet "${sheetName}" (no rows to write)`);
      return;
    }

    await client.spreadsheets.values.update({
      spreadsheetId: this.sheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows },
    });

    this.logger.log(`Wrote ${rows.length} rows to sheet "${sheetName}"`);
  }

  async syncPayments(billingMonth?: string): Promise<{ synced: number }> {
    const db = this.supabaseService.getClient();

    let builder = db
      .from('Payment')
      .select('*')
      .eq('IsActive', 1)
      .order('PaidAt', { ascending: false });

    if (billingMonth) {
      builder = builder.gte('PaidAt', `${billingMonth}-01`).lt('PaidAt', `${billingMonth}-32`);
    }

    const { data, error } = await builder;
    if (error) throw error;

    const payments = data ?? [];
    const rows: unknown[][] = [
      [
        'Code',
        'StudentCode',
        'InvoiceCode',
        'TeacherCode',
        'Amount',
        'Method',
        'Status',
        'PaidAt',
        'CreatedFrom',
      ],
    ];

    for (const p of payments) {
      rows.push([
        p.Code,
        p.StudentCode,
        p.InvoiceCode,
        p.TeacherCode,
        p.Amount,
        p.Method,
        p.Status,
        p.PaidAt ?? '',
        p.CreatedFrom,
      ]);
    }

    await this.clearAndWrite('Payments', rows);
    return { synced: payments.length };
  }

  async syncInvoices(classCode?: string): Promise<{ synced: number }> {
    const db = this.supabaseService.getClient();

    let builder = db
      .from('Invoice')
      .select('*')
      .eq('IsActive', 1)
      .order('Id', { ascending: false });

    if (classCode) {
      builder = builder.eq('ClassCode', classCode);
    }

    const { data, error } = await builder;
    if (error) throw error;

    const invoices = data ?? [];
    const rows: unknown[][] = [
      [
        'Code',
        'StudentCode',
        'ClassCode',
        'BillingMonth',
        'TotalAmount',
        'PaidAmount',
        'RemainingAmount',
        'Status',
        'DueDate',
      ],
    ];

    for (const inv of invoices) {
      rows.push([
        inv.Code,
        inv.StudentCode,
        inv.ClassCode,
        inv.BillingMonth,
        inv.TotalAmount,
        inv.PaidAmount,
        inv.RemainingAmount,
        inv.Status,
        inv.DueDate ?? '',
      ]);
    }

    await this.clearAndWrite('Invoices', rows);
    return { synced: invoices.length };
  }

  async syncStudents(classCode?: string): Promise<{ synced: number }> {
    const db = this.supabaseService.getClient();

    let builder = db
      .from('User')
      .select('*')
      .eq('Role', 'student')
      .eq('IsActive', 1)
      .order('Name');

    if (classCode) {
      builder = builder.eq('ClassCode', classCode);
    }

    const { data, error } = await builder;
    if (error) throw error;

    const students = data ?? [];
    const rows: unknown[][] = [
      ['Code', 'Name', 'ClassCode', 'Phone', 'Nickname', 'ZaloUserId'],
    ];

    for (const s of students) {
      rows.push([
        s.Code,
        s.Name,
        s.ClassCode ?? '',
        s.Phone ?? '',
        s.Nickname ?? '',
        s.ZaloUserId ?? '',
      ]);
    }

    await this.clearAndWrite('Students', rows);
    return { synced: students.length };
  }
}
