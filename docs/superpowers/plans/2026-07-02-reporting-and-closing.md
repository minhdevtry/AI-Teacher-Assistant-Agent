# Reporting and Monthly Closing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a robust Monthly Closing management module and a comprehensive Reports query module in NestJS to support a premium flagship frontend dashboard.

**Architecture:** Use NestJS controllers and services with `@supabase/supabase-js` service role client. Implements a hybrid calculation strategy (real-time for the current billing month, snapshot table queries for historical months), and updates Mastra tools to persist monthly closures.

**Tech Stack:** NestJS 11, TypeScript, Supabase Client, class-validator, class-transformer, NestJS Config, NestJS Swagger.

## Global Constraints
- Database conventions: CamelCase for table names and column names.
- Tables linked via `Code` fields (varchar 24), no foreign key constraints.
- Soft delete via `IsActive` flag (0 = deleted, 1 = active).
- Standard audit columns: `Id`, `Name`, `Code`, `Description`, `CreatedAt`, `ModifiedAt`, `IsActive`.
- PascalCase for classes, camelCase for methods, kebab-case for filenames.
- Return typed responses via `BaseResponseDto`.
- Use NestJS built-in `Logger` inside services.

---

### Task 1: Scaffolding Monthly Closing DTOs and Module

**Files:**
- Create: `src/domain/monthly-closing/dto/create-monthly-closing.dto.ts`
- Create: `src/domain/monthly-closing/dto/query-monthly-closing.dto.ts`
- Create: `src/domain/monthly-closing/dto/index.ts`
- Create: `src/domain/monthly-closing/monthly-closing.module.ts`

**Interfaces:**
- Produces: `CreateMonthlyClosingDto`, `QueryMonthlyClosingDto`

- [ ] **Step 1: Write DTO classes**
  Write DTO classes with `class-validator` and `nestjs/swagger` decorators.

  Create `src/domain/monthly-closing/dto/create-monthly-closing.dto.ts`:
  ```typescript
  import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
  import { IsString, IsNotEmpty, IsInt, Min, IsOptional } from 'class-validator';

  export class CreateMonthlyClosingDto {
    @ApiProperty({ example: 'CLS001' })
    @IsString()
    @IsNotEmpty()
    classCode!: string;

    @ApiProperty({ example: '2026-07' })
    @IsString()
    @IsNotEmpty()
    billingMonth!: string;
  }
  ```

  Create `src/domain/monthly-closing/dto/query-monthly-closing.dto.ts`:
  ```typescript
  import { ApiPropertyOptional } from '@nestjs/swagger';
  import { IsString, IsOptional } from 'class-validator';
  import { PaginationDto } from '../../common/pagination.dto';

  export class QueryMonthlyClosingDto extends PaginationDto {
    @ApiPropertyOptional({ example: 'CLS001' })
    @IsString()
    @IsOptional()
    classCode?: string;

    @ApiPropertyOptional({ example: '2026-07' })
    @IsString()
    @IsOptional()
    billingMonth?: string;

    @ApiPropertyOptional({ example: 'draft' })
    @IsString()
    @IsOptional()
    status?: string;
  }
  ```

  Create `src/domain/monthly-closing/dto/index.ts`:
  ```typescript
  export * from './create-monthly-closing.dto';
  export * from './query-monthly-closing.dto';
  ```

- [ ] **Step 2: Create Module skeleton**
  Create `src/domain/monthly-closing/monthly-closing.module.ts`:
  ```typescript
  import { Module } from '@nestjs/common';

  @Module({
    imports: [],
    providers: [],
    controllers: [],
    exports: [],
  })
  export class MonthlyClosingModule {}
  ```

- [ ] **Step 3: Register in AppModule**
  Modify `src/app.module.ts` to import `MonthlyClosingModule`:
  ```typescript
  import { MonthlyClosingModule } from './domain/monthly-closing/monthly-closing.module';
  // Add to imports array of @Module decorator
  ```

- [ ] **Step 4: Verify Compilation**
  Run: `npm run build`
  Expected: Command succeeds with 0 issues.

- [ ] **Step 5: Commit changes**
  Run:
  ```bash
  git add src/domain/monthly-closing/dto/ src/domain/monthly-closing/monthly-closing.module.ts src/app.module.ts
  git commit -m "feat(monthly-closing): scaffold monthly closing module and DTOs"
  ```

---

### Task 2: Implementing MonthlyClosingService

**Files:**
- Create: `src/domain/monthly-closing/monthly-closing.service.ts`
- Modify: `src/domain/monthly-closing/monthly-closing.module.ts`

**Interfaces:**
- Consumes: `SupabaseService`, `AuditService`, `ClassesService`, `InvoicesService`
- Produces: `MonthlyClosingService` with methods:
  - `findAll(query: QueryMonthlyClosingDto)`
  - `findByCode(code: string)`
  - `createOrUpdateDraft(classCode: string, billingMonth: string)`
  - `finalize(code: string)`
  - `reopen(code: string)`

- [ ] **Step 1: Write MonthlyClosingService**
  Create `src/domain/monthly-closing/monthly-closing.service.ts`:
  ```typescript
  import {
    Injectable,
    NotFoundException,
    InternalServerErrorException,
    BadRequestException,
    Logger,
  } from '@nestjs/common';
  import { SupabaseService } from '../../integrations/supabase/supabase.service';
  import { AuditService } from '../common/audit.service';
  import { ClassesService } from '../classes/classes.service';
  import { InvoicesService } from '../invoices/invoices.service';
  import { CodeGenerator } from '../common/code-generator';
  import { QueryMonthlyClosingDto } from './dto';

  @Injectable()
  export class MonthlyClosingService {
    private readonly logger = new Logger(MonthlyClosingService.name);

    constructor(
      private readonly supabaseService: SupabaseService,
      private readonly auditService: AuditService,
      private readonly classesService: ClassesService,
      private readonly invoicesService: InvoicesService,
    ) {}

    async findAll(query: QueryMonthlyClosingDto) {
      const client = this.supabaseService.getClient();
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      let builder = client
        .from('MonthlyClosing')
        .select('*', { count: 'exact' })
        .eq('IsActive', 1)
        .range(from, to)
        .order('Id', { ascending: false });

      if (query.classCode) builder = builder.eq('ClassCode', query.classCode);
      if (query.billingMonth) builder = builder.eq('BillingMonth', query.billingMonth);
      if (query.status) builder = builder.eq('Status', query.status);

      const { data, count, error } = await builder;
      if (error) {
        this.logger.error(`findAll monthly closings failed: ${error.message}`);
        throw new InternalServerErrorException('Failed to fetch monthly closings');
      }

      return { data: data ?? [], total: count ?? 0, page, limit };
    }

    async findByCode(code: string) {
      const client = this.supabaseService.getClient();
      const { data, error } = await client
        .from('MonthlyClosing')
        .select('*')
        .eq('Code', code)
        .eq('IsActive', 1)
        .maybeSingle();

      if (error) {
        this.logger.error(`findByCode(${code}) failed: ${error.message}`);
        throw new InternalServerErrorException('Failed to fetch monthly closing');
      }
      if (!data) throw new NotFoundException(`Monthly closing with Code ${code} not found`);
      return data;
    }

    async createOrUpdateDraft(classCode: string, billingMonth: string) {
      const client = this.supabaseService.getClient();

      // Get class and teacher profile
      const classData = await this.classesService.findByCode(classCode);
      const studentCount = await this.classesService.getStudentCount(classCode);

      // Get invoices for the class/month
      const invoicesResult = await this.invoicesService.findAll({
        classCode,
        billingMonth,
        limit: 1000,
      });
      const invoices = invoicesResult.data;

      const expectedRevenue = studentCount * classData.FeeAmount;
      const collectedRevenue = invoices.reduce((sum: number, inv: any) => sum + (inv.PaidAmount || 0), 0);
      const outstandingDebt = invoices.reduce((sum: number, inv: any) => sum + (inv.RemainingAmount || 0), 0);

      const studentsReport = invoices.map((inv: any) => ({
        studentCode: inv.StudentCode,
        invoiceCode: inv.Code,
        totalAmount: inv.TotalAmount,
        paidAmount: inv.PaidAmount,
        remainingAmount: inv.RemainingAmount,
        status: inv.Status,
      }));

      const reportJson = JSON.stringify({
        classCode,
        className: classData.Name,
        billingMonth,
        totalStudents: studentCount,
        expectedRevenue,
        collectedRevenue,
        outstandingDebt,
        students: studentsReport,
        generatedAt: new Date().toISOString(),
      });

      // Check if closing record already exists
      const { data: existing, error: findError } = await client
        .from('MonthlyClosing')
        .select('*')
        .eq('ClassCode', classCode)
        .eq('BillingMonth', billingMonth)
        .eq('IsActive', 1)
        .maybeSingle();

      if (findError) {
        this.logger.error(`Find existing monthly closing error: ${findError.message}`);
        throw new InternalServerErrorException('Failed to verify existing monthly closing');
      }

      if (existing) {
        if (existing.Status === 'finalized') {
          throw new BadRequestException('Cannot modify a finalized monthly closing');
        }

        const { data, error } = await client
          .from('MonthlyClosing')
          .update({
            Name: `Chốt tháng ${billingMonth} - ${classData.Name}`,
            TotalStudents: studentCount,
            ExpectedRevenue: expectedRevenue,
            CollectedRevenue: collectedRevenue,
            OutstandingDebt: outstandingDebt,
            ReportJson: reportJson,
            ModifiedAt: new Date().toISOString(),
          })
          .eq('Id', existing.Id)
          .select()
          .single();

        if (error) {
          this.logger.error(`Update monthly closing failed: ${error.message}`);
          throw new InternalServerErrorException('Failed to update monthly closing');
        }

        await this.auditService.log({
          TeacherCode: classData.TeacherCode,
          EntityType: 'MonthlyClosing',
          EntityCode: existing.Code,
          Action: 'UPDATE_DRAFT',
          NewValue: JSON.stringify(data),
          ActorType: 'system',
        });

        return data;
      }

      // Create new monthly closing
      const { data: maxRow } = await client
        .from('MonthlyClosing')
        .select('Code')
        .like('Code', 'MCL%')
        .order('Id', { ascending: false })
        .limit(1)
        .maybeSingle();

      const code = CodeGenerator.generate('MCL', maxRow?.Code ?? null);

      const { data, error } = await client
        .from('MonthlyClosing')
        .insert({
          Name: `Chốt tháng ${billingMonth} - ${classData.Name}`,
          Code: code,
          Description: `Báo cáo chốt sổ lớp ${classData.Name} tháng ${billingMonth}`,
          ClassCode: classCode,
          TeacherCode: classData.TeacherCode,
          BillingMonth: billingMonth,
          TotalStudents: studentCount,
          ExpectedRevenue: expectedRevenue,
          CollectedRevenue: collectedRevenue,
          OutstandingDebt: outstandingDebt,
          Status: 'draft',
          ReportJson: reportJson,
        })
        .select()
        .single();

      if (error) {
        this.logger.error(`Insert monthly closing failed: ${error.message}`);
        throw new InternalServerErrorException('Failed to create monthly closing draft');
      }

      await this.auditService.log({
        TeacherCode: classData.TeacherCode,
        EntityType: 'MonthlyClosing',
        EntityCode: code,
        Action: 'CREATE_DRAFT',
        NewValue: JSON.stringify(data),
        ActorType: 'system',
      });

      return data;
    }

    async finalize(code: string) {
      const existing = await this.findByCode(code);
      if (existing.Status === 'finalized') {
        return existing;
      }

      const client = this.supabaseService.getClient();
      const { data, error } = await client
        .from('MonthlyClosing')
        .update({
          Status: 'finalized',
          ModifiedAt: new Date().toISOString(),
        })
        .eq('Code', code)
        .select()
        .single();

      if (error) {
        this.logger.error(`Finalize monthly closing ${code} failed: ${error.message}`);
        throw new InternalServerErrorException('Failed to finalize monthly closing');
      }

      await this.auditService.log({
        TeacherCode: existing.TeacherCode,
        EntityType: 'MonthlyClosing',
        EntityCode: code,
        Action: 'FINALIZE',
        OldValue: JSON.stringify({ Status: existing.Status }),
        NewValue: JSON.stringify({ Status: 'finalized' }),
        ActorType: 'system',
      });

      return data;
    }

    async reopen(code: string) {
      const existing = await this.findByCode(code);
      if (existing.Status === 'draft') {
        return existing;
      }

      const client = this.supabaseService.getClient();
      const { data, error } = await client
        .from('MonthlyClosing')
        .update({
          Status: 'draft',
          ModifiedAt: new Date().toISOString(),
        })
        .eq('Code', code)
        .select()
        .single();

      if (error) {
        this.logger.error(`Reopen monthly closing ${code} failed: ${error.message}`);
        throw new InternalServerErrorException('Failed to reopen monthly closing');
      }

      await this.auditService.log({
        TeacherCode: existing.TeacherCode,
        EntityType: 'MonthlyClosing',
        EntityCode: code,
        Action: 'REOPEN',
        OldValue: JSON.stringify({ Status: existing.Status }),
        NewValue: JSON.stringify({ Status: 'draft' }),
        ActorType: 'system',
      });

      return data;
    }
  }
  ```

- [ ] **Step 2: Update Module declaration**
  Modify `src/domain/monthly-closing/monthly-closing.module.ts`:
  ```typescript
  import { Module } from '@nestjs/common';
  import { MonthlyClosingService } from './monthly-closing.service';
  import { SupabaseModule } from '../../integrations/supabase/supabase.module';
  import { AuditModule } from '../common/audit.module'; // Or if audit logic is in common module
  import { ClassesModule } from '../classes/classes.module';
  import { InvoicesModule } from '../invoices/invoices.module';

  @Module({
    imports: [SupabaseModule, ClassesModule, InvoicesModule],
    providers: [MonthlyClosingService],
    exports: [MonthlyClosingService],
  })
  export class MonthlyClosingModule {}
  ```
  *(Note: Since audit.service is in domain/common, if there is a CommonModule, import it, or inject AuditService since AuditModule is registered globally. Check where AuditService is registered. We saw in invoices.module it was imported or resolved. Let's make sure ClassesModule and InvoicesModule export their services.)*

- [ ] **Step 3: Verify build**
  Run: `npm run build`
  Expected: Builds correctly.

- [ ] **Step 4: Commit changes**
  Run:
  ```bash
  git add src/domain/monthly-closing/monthly-closing.service.ts src/domain/monthly-closing/monthly-closing.module.ts
  git commit -m "feat(monthly-closing): implement MonthlyClosingService"
  ```

---

### Task 3: Implementing MonthlyClosingController

**Files:**
- Create: `src/domain/monthly-closing/monthly-closing.controller.ts`
- Modify: `src/domain/monthly-closing/monthly-closing.module.ts`

**Interfaces:**
- Consumes: `MonthlyClosingService`
- Produces: `MonthlyClosingController` with routes:
  - `GET /api/monthly-closing`
  - `GET /api/monthly-closing/:code`
  - `POST /api/monthly-closing`
  - `POST /api/monthly-closing/:code/finalize`
  - `POST /api/monthly-closing/:code/reopen`

- [ ] **Step 1: Write controller code**
  Create `src/domain/monthly-closing/monthly-closing.controller.ts`:
  ```typescript
  import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Query,
    UsePipes,
    ValidationPipe,
  } from '@nestjs/common';
  import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
  import { MonthlyClosingService } from './monthly-closing.service';
  import { CreateMonthlyClosingDto, QueryMonthlyClosingDto } from './dto';
  import { BaseResponseDto } from '../common/base-response.dto';

  @ApiTags('Monthly Closing')
  @Controller('api/monthly-closing')
  @UsePipes(new ValidationPipe({ transform: true }))
  export class MonthlyClosingController {
    constructor(private readonly monthlyClosingService: MonthlyClosingService) {}

    @Get()
    @ApiOperation({ summary: 'Lấy danh sách các bản chốt sổ tháng' })
    @ApiResponse({ status: 200, description: 'Success' })
    async findAll(@Query() query: QueryMonthlyClosingDto) {
      const result = await this.monthlyClosingService.findAll(query);
      return BaseResponseDto.paginated(
        result.data,
        result.total,
        result.page,
        result.limit,
      );
    }

    @Get(':code')
    @ApiOperation({ summary: 'Lấy chi tiết bản chốt sổ tháng theo Code' })
    @ApiParam({ name: 'code', description: 'Mã chốt sổ (VD: MCL001)' })
    async findByCode(@Param('code') code: string) {
      const data = await this.monthlyClosingService.findByCode(code);
      return BaseResponseDto.ok(data);
    }

    @Post()
    @ApiOperation({ summary: 'Tạo hoặc cập nhật nháp bản chốt sổ tháng' })
    async createDraft(@Body() dto: CreateMonthlyClosingDto) {
      const data = await this.monthlyClosingService.createOrUpdateDraft(
        dto.classCode,
        dto.billingMonth,
      );
      return BaseResponseDto.ok(data, 'Đã tạo/cập nhật bản chốt sổ nháp thành công');
    }

    @Post(':code/finalize')
    @ApiOperation({ summary: 'Phê duyệt hoàn thành chốt sổ tháng' })
    @ApiParam({ name: 'code', description: 'Mã chốt sổ' })
    async finalize(@Param('code') code: string) {
      const data = await this.monthlyClosingService.finalize(code);
      return BaseResponseDto.ok(data, 'Đã hoàn thành chốt sổ tháng');
    }

    @Post(':code/reopen')
    @ApiOperation({ summary: 'Mở lại bản chốt sổ đã phê duyệt về nháp' })
    @ApiParam({ name: 'code', description: 'Mã chốt sổ' })
    async reopen(@Param('code') code: string) {
      const data = await this.monthlyClosingService.reopen(code);
      return BaseResponseDto.ok(data, 'Đã mở lại chốt sổ tháng');
    }
  }
  ```

- [ ] **Step 2: Register controller in Module**
  Modify `src/domain/monthly-closing/monthly-closing.module.ts`:
  ```typescript
  // Import MonthlyClosingController and add it to controllers array
  import { MonthlyClosingController } from './monthly-closing.controller';
  // controllers: [MonthlyClosingController],
  ```

- [ ] **Step 3: Verify build**
  Run: `npm run build`
  Expected: Builds correctly.

- [ ] **Step 4: Commit changes**
  Run:
  ```bash
  git add src/domain/monthly-closing/monthly-closing.controller.ts src/domain/monthly-closing/monthly-closing.module.ts
  git commit -m "feat(monthly-closing): implement MonthlyClosingController"
  ```

---

### Task 4: Implementing ReportsService

**Files:**
- Create: `src/domain/reports/reports.service.ts`
- Create: `src/domain/reports/reports.module.ts`

**Interfaces:**
- Consumes: `SupabaseService`, `ClassesService`, `InvoicesService`, `MonthlyClosingService`
- Produces: `ReportsService` with methods:
  - `getDashboardSummary(month?: string)`
  - `getClassFinancials(month?: string)`
  - `getRevenueTrends(limit?: number)`
  - `getDebtors()`
  - `getClassDetailReport(classCode: string, month: string)`

- [ ] **Step 1: Write ReportsService**
  Create `src/domain/reports/reports.service.ts`:
  ```typescript
  import { Injectable, Logger, InternalServerErrorException, NotFoundException } from '@nestjs/common';
  import { SupabaseService } from '../../integrations/supabase/supabase.service';
  import { ClassesService } from '../classes/classes.service';
  import { InvoicesService } from '../invoices/invoices.service';
  import { MonthlyClosingService } from '../monthly-closing/monthly-closing.service';

  @Injectable()
  export class ReportsService {
    private readonly logger = new Logger(ReportsService.name);

    constructor(
      private readonly supabaseService: SupabaseService,
      private readonly classesService: ClassesService,
      private readonly invoicesService: InvoicesService,
      private readonly monthlyClosingService: MonthlyClosingService,
    ) {}

    private getCurrentMonth(): string {
      const d = new Date();
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      return `${year}-${month}`;
    }

    private getPreviousMonth(monthStr: string): string {
      const [year, month] = monthStr.split('-').map(Number);
      const d = new Date(year, month - 2, 1);
      const prevYear = d.getFullYear();
      const prevMonth = String(d.getMonth() + 1).padStart(2, '0');
      return `${prevYear}-${prevMonth}`;
    }

    async getDashboardSummary(month?: string) {
      const activeMonth = month || this.getCurrentMonth();
      const client = this.supabaseService.getClient();

      // 1. Get active classes and total students count
      const classesResult = await this.classesService.findAll({ status: 'active', limit: 1000 });
      const activeClasses = classesResult.data;
      const totalClasses = classesResult.total;

      const { count: totalStudents, error: studentErr } = await client
        .from('User')
        .select('*', { count: 'exact', head: true })
        .eq('Role', 'student')
        .eq('IsActive', 1);

      if (studentErr) throw new InternalServerErrorException('Failed to count students');

      // 2. Compute financial summary for target month
      let expectedRevenue = 0;
      let collectedRevenue = 0;
      let outstandingDebt = 0;

      const current = this.getCurrentMonth();
      if (activeMonth === current) {
        // Calculate on-the-fly for current month
        const { data: invoices, error: invError } = await client
          .from('Invoice')
          .select('TotalAmount, PaidAmount, RemainingAmount')
          .eq('BillingMonth', activeMonth)
          .eq('IsActive', 1);

        if (invError) throw new InternalServerErrorException('Failed to calculate current month invoices');

        (invoices || []).forEach(inv => {
          expectedRevenue += inv.TotalAmount;
          collectedRevenue += inv.PaidAmount;
          outstandingDebt += inv.RemainingAmount;
        });
      } else {
        // Read historical snapshot from MonthlyClosing table
        const { data: closings, error: closeError } = await client
          .from('MonthlyClosing')
          .select('ExpectedRevenue, CollectedRevenue, OutstandingDebt')
          .eq('BillingMonth', activeMonth)
          .eq('Status', 'finalized')
          .eq('IsActive', 1);

        if (closeError) throw new InternalServerErrorException('Failed to query historical monthly closing');

        (closings || []).forEach(close => {
          expectedRevenue += close.ExpectedRevenue;
          collectedRevenue += close.CollectedRevenue;
          outstandingDebt += close.OutstandingDebt;
        });

        // Fallback to dynamic if no closed data exists
        if ((closings || []).length === 0) {
          const { data: invoices, error: invError } = await client
            .from('Invoice')
            .select('TotalAmount, PaidAmount, RemainingAmount')
            .eq('BillingMonth', activeMonth)
            .eq('IsActive', 1);

          if (!invError) {
            (invoices || []).forEach(inv => {
              expectedRevenue += inv.TotalAmount;
              collectedRevenue += inv.PaidAmount;
              outstandingDebt += inv.RemainingAmount;
            });
          }
        }
      }

      const collectionRate = expectedRevenue > 0
        ? Math.round((collectedRevenue / expectedRevenue) * 1000) / 10
        : 0;

      // 3. Compute growth comparison with previous month
      const prevMonth = this.getPreviousMonth(activeMonth);
      let prevExpected = 0;
      let prevCollected = 0;
      let prevDebt = 0;

      const { data: prevClosings } = await client
        .from('MonthlyClosing')
        .select('ExpectedRevenue, CollectedRevenue, OutstandingDebt')
        .eq('BillingMonth', prevMonth)
        .eq('IsActive', 1);

      (prevClosings || []).forEach(close => {
        prevExpected += close.ExpectedRevenue;
        prevCollected += close.CollectedRevenue;
        prevDebt += close.OutstandingDebt;
      });

      if ((prevClosings || []).length === 0) {
        const { data: prevInvoices } = await client
          .from('Invoice')
          .select('TotalAmount, PaidAmount, RemainingAmount')
          .eq('BillingMonth', prevMonth)
          .eq('IsActive', 1);

        (prevInvoices || []).forEach(inv => {
          prevExpected += inv.TotalAmount;
          prevCollected += inv.PaidAmount;
          prevDebt += inv.RemainingAmount;
        });
      }

      const calcGrowth = (curr: number, prev: number) => {
        if (prev === 0) return curr > 0 ? 100 : 0;
        return Math.round(((curr - prev) / prev) * 1000) / 10;
      };

      return {
        billingMonth: activeMonth,
        totalClasses,
        totalStudents: totalStudents ?? 0,
        expectedRevenue,
        collectedRevenue,
        outstandingDebt,
        collectionRate,
        comparison: {
          expectedChangeRate: calcGrowth(expectedRevenue, prevExpected),
          collectedChangeRate: calcGrowth(collectedRevenue, prevCollected),
          debtChangeRate: calcGrowth(outstandingDebt, prevDebt),
        },
      };
    }

    async getClassFinancials(month?: string) {
      const targetMonth = month || this.getCurrentMonth();
      const client = this.supabaseService.getClient();

      // Get all active classes
      const { data: classes, error: classError } = await client
        .from('Class')
        .select('*')
        .eq('IsActive', 1);

      if (classError) throw new InternalServerErrorException('Failed to fetch classes');

      const financials = [];

      for (const cls of classes) {
        const studentCount = await this.classesService.getStudentCount(cls.Code);

        // Check closed history snapshot
        const { data: closing } = await client
          .from('MonthlyClosing')
          .select('*')
          .eq('ClassCode', cls.Code)
          .eq('BillingMonth', targetMonth)
          .eq('IsActive', 1)
          .maybeSingle();

        if (closing && closing.Status === 'finalized') {
          financials.push({
            classCode: cls.Code,
            className: cls.Name,
            subject: cls.Subject,
            totalStudents: closing.TotalStudents,
            expectedRevenue: closing.ExpectedRevenue,
            collectedRevenue: closing.CollectedRevenue,
            outstandingDebt: closing.OutstandingDebt,
            collectionRate: closing.ExpectedRevenue > 0
              ? Math.round((closing.CollectedRevenue / closing.ExpectedRevenue) * 1000) / 10
              : 0,
            status: 'closed',
          });
        } else {
          // Dynamic calculation
          const { data: invoices } = await client
            .from('Invoice')
            .select('TotalAmount, PaidAmount, RemainingAmount')
            .eq('ClassCode', cls.Code)
            .eq('BillingMonth', targetMonth)
            .eq('IsActive', 1);

          let expected = studentCount * cls.FeeAmount;
          let collected = 0;
          let debt = 0;

          (invoices || []).forEach(inv => {
            collected += inv.PaidAmount;
            debt += inv.RemainingAmount;
          });

          financials.push({
            classCode: cls.Code,
            className: cls.Name,
            subject: cls.Subject,
            totalStudents: studentCount,
            expectedRevenue: expected,
            collectedRevenue: collected,
            outstandingDebt: debt,
            collectionRate: expected > 0 ? Math.round((collected / expected) * 1000) / 10 : 0,
            status: closing ? 'draft' : 'unclosed',
          });
        }
      }

      return financials;
    }

    async getRevenueTrends(limit = 6) {
      const client = this.supabaseService.getClient();
      const current = this.getCurrentMonth();
      const trends = [];

      // Generate list of billing months
      const months = [];
      const [currYear, currMonth] = current.split('-').map(Number);

      for (let i = limit - 1; i >= 0; i--) {
        const d = new Date(currYear, currMonth - 1 - i, 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        months.push(`${y}-${m}`);
      }

      for (const m of months) {
        let expected = 0;
        let collected = 0;

        // Try getting from closed summaries
        const { data: closings } = await client
          .from('MonthlyClosing')
          .select('ExpectedRevenue, CollectedRevenue')
          .eq('BillingMonth', m)
          .eq('Status', 'finalized')
          .eq('IsActive', 1);

        if (closings && closings.length > 0) {
          closings.forEach(c => {
            expected += c.ExpectedRevenue;
            collected += c.CollectedRevenue;
          });
        } else {
          // Fallback to live invoices
          const { data: invoices } = await client
            .from('Invoice')
            .select('TotalAmount, PaidAmount')
            .eq('BillingMonth', m)
            .eq('IsActive', 1);

          (invoices || []).forEach(inv => {
            expected += inv.TotalAmount;
            collected += inv.PaidAmount;
          });
        }

        trends.push({
          billingMonth: m,
          expectedRevenue: expected,
          collectedRevenue: collected,
          collectionRate: expected > 0 ? Math.round((collected / expected) * 1000) / 10 : 0,
        });
      }

      return trends;
    }

    async getDebtors() {
      const client = this.supabaseService.getClient();

      // Query unpaid/partial invoices
      const { data: invoices, error } = await client
        .from('Invoice')
        .select('*')
        .eq('IsActive', 1)
        .in('Status', ['unpaid', 'partial'])
        .order('RemainingAmount', { ascending: false });

      if (error) throw new InternalServerErrorException('Failed to fetch overdue invoices');

      const debtors = [];

      for (const inv of invoices) {
        // Get student details
        const { data: student } = await client
          .from('User')
          .select('Name, Nickname, Phone')
          .eq('Code', inv.StudentCode)
          .eq('IsActive', 1)
          .maybeSingle();

        // Get class details
        const { data: classData } = await client
          .from('Class')
          .select('Name')
          .eq('Code', inv.ClassCode)
          .eq('IsActive', 1)
          .maybeSingle();

        debtors.push({
          studentCode: inv.StudentCode,
          studentName: student?.Name || 'Không rõ',
          nickname: student?.Nickname || '',
          phone: student?.Phone || '',
          classCode: inv.ClassCode,
          className: classData?.Name || 'Không rõ',
          invoiceCode: inv.Code,
          billingMonth: inv.BillingMonth,
          totalAmount: inv.TotalAmount,
          remainingAmount: inv.RemainingAmount,
          dueDate: inv.DueDate,
        });
      }

      return debtors;
    }

    async getClassDetailReport(classCode: string, month: string) {
      const client = this.supabaseService.getClient();

      const classData = await this.classesService.findByCode(classCode);
      const studentCount = await this.classesService.getStudentCount(classCode);

      // Check if closing history exists
      const { data: closing } = await client
        .from('MonthlyClosing')
        .select('ReportJson, Status')
        .eq('ClassCode', classCode)
        .eq('BillingMonth', month)
        .eq('IsActive', 1)
        .maybeSingle();

      if (closing && closing.Status === 'finalized' && closing.ReportJson) {
        const report = JSON.parse(closing.ReportJson);
        return {
          ...report,
          status: 'closed',
        };
      }

      // Dynamic calculation
      const invoicesResult = await this.invoicesService.findAll({
        classCode,
        billingMonth: month,
        limit: 1000,
      });

      const invoices = invoicesResult.data;
      const expectedRevenue = studentCount * classData.FeeAmount;
      const collectedRevenue = invoices.reduce((sum: number, inv: any) => sum + (inv.PaidAmount || 0), 0);
      const outstandingDebt = invoices.reduce((sum: number, inv: any) => sum + (inv.RemainingAmount || 0), 0);

      const studentsBreakdown = [];
      for (const inv of invoices) {
        const { data: student } = await client
          .from('User')
          .select('Name, Nickname')
          .eq('Code', inv.StudentCode)
          .maybeSingle();

        studentsBreakdown.push({
          studentCode: inv.StudentCode,
          studentName: student?.Name || 'Không rõ',
          nickname: student?.Nickname || '',
          invoiceCode: inv.Code,
          totalAmount: inv.TotalAmount,
          paidAmount: inv.PaidAmount,
          remainingAmount: inv.RemainingAmount,
          status: inv.Status,
        });
      }

      return {
        classCode,
        className: classData.Name,
        billingMonth: month,
        totalStudents: studentCount,
        expectedRevenue,
        collectedRevenue,
        outstandingDebt,
        students: studentsBreakdown,
        status: closing ? 'draft' : 'unclosed',
      };
    }
  }
  ```

- [ ] **Step 2: Create ReportsModule**
  Create `src/domain/reports/reports.module.ts`:
  ```typescript
  import { Module } from '@nestjs/common';
  import { ReportsService } from './reports.service';
  import { SupabaseModule } from '../../integrations/supabase/supabase.module';
  import { ClassesModule } from '../classes/classes.module';
  import { InvoicesModule } from '../invoices/invoices.module';
  import { MonthlyClosingModule } from '../monthly-closing/monthly-closing.module';

  @Module({
    imports: [SupabaseModule, ClassesModule, InvoicesModule, MonthlyClosingModule],
    providers: [ReportsService],
    exports: [ReportsService],
  })
  export class ReportsModule {}
  ```

- [ ] **Step 3: Register in AppModule**
  Modify `src/app.module.ts` to import `ReportsModule`:
  ```typescript
  import { ReportsModule } from './domain/reports/reports.module';
  // Add to imports array of @Module decorator
  ```

- [ ] **Step 4: Verify build**
  Run: `npm run build`
  Expected: Builds correctly.

- [ ] **Step 5: Commit changes**
  Run:
  ```bash
  git add src/domain/reports/reports.service.ts src/domain/reports/reports.module.ts src/app.module.ts
  git commit -m "feat(reports): implement ReportsService"
  ```

---

### Task 5: Implementing ReportsController

**Files:**
- Create: `src/domain/reports/reports.controller.ts`
- Modify: `src/domain/reports/reports.module.ts`

**Interfaces:**
- Consumes: `ReportsService`
- Produces: `ReportsController` with routes:
  - `GET /api/reports/dashboard-summary`
  - `GET /api/reports/classes`
  - `GET /api/reports/trends`
  - `GET /api/reports/debtors`
  - `GET /api/reports/class/:classCode/month/:month`

- [ ] **Step 1: Write controller code**
  Create `src/domain/reports/reports.controller.ts`:
  ```typescript
  import { Controller, Get, Param, Query } from '@nestjs/common';
  import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
  import { ReportsService } from './reports.service';
  import { BaseResponseDto } from '../common/base-response.dto';

  @ApiTags('Reports')
  @Controller('api/reports')
  export class ReportsController {
    constructor(private readonly reportsService: ReportsService) {}

    @Get('dashboard-summary')
    @ApiOperation({ summary: 'Lấy báo cáo tổng hợp kết quả (KPI KPI)' })
    @ApiQuery({ name: 'month', required: false, description: 'Tháng báo cáo (Format: YYYY-MM)' })
    async getDashboardSummary(@Query('month') month?: string) {
      const data = await this.reportsService.getDashboardSummary(month);
      return BaseResponseDto.ok(data);
    }

    @Get('classes')
    @ApiOperation({ summary: 'Lấy báo cáo doanh thu theo từng lớp' })
    @ApiQuery({ name: 'month', required: false, description: 'Tháng báo cáo (Format: YYYY-MM)' })
    async getClassFinancials(@Query('month') month?: string) {
      const data = await this.reportsService.getClassFinancials(month);
      return BaseResponseDto.ok(data);
    }

    @Get('trends')
    @ApiOperation({ summary: 'Lấy biểu đồ xu hướng doanh thu lịch sử' })
    @ApiQuery({ name: 'limit', required: false, description: 'Số tháng xem lịch sử' })
    async getRevenueTrends(@Query('limit') limit?: string) {
      const parsedLimit = limit ? parseInt(limit, 10) : 6;
      const data = await this.reportsService.getRevenueTrends(parsedLimit);
      return BaseResponseDto.ok(data);
    }

    @Get('debtors')
    @ApiOperation({ summary: 'Lấy danh sách học sinh nợ học phí' })
    async getDebtors() {
      const data = await this.reportsService.getDebtors();
      return BaseResponseDto.ok(data);
    }

    @Get('class/:classCode/month/:month')
    @ApiOperation({ summary: 'Báo cáo chi tiết thu phí của một lớp cụ thể theo tháng' })
    @ApiParam({ name: 'classCode', description: 'Mã lớp' })
    @ApiParam({ name: 'month', description: 'Tháng (Format: YYYY-MM)' })
    async getClassDetailReport(
      @Param('classCode') classCode: string,
      @Param('month') month: string,
    ) {
      const data = await this.reportsService.getClassDetailReport(classCode, month);
      return BaseResponseDto.ok(data);
    }
  }
  ```

- [ ] **Step 2: Add controller to module**
  Modify `src/domain/reports/reports.module.ts`:
  ```typescript
  // Import ReportsController and add it to controllers array
  import { ReportsController } from './reports.controller';
  // controllers: [ReportsController],
  ```

- [ ] **Step 3: Verify build**
  Run: `npm run build`
  Expected: Builds correctly.

- [ ] **Step 4: Commit changes**
  Run:
  ```bash
  git add src/domain/reports/reports.controller.ts src/domain/reports/reports.module.ts
  git commit -m "feat(reports): implement ReportsController and expose endpoints"
  ```

---

### Task 6: Hooking Mastra Tools into MonthlyClosingService

**Files:**
- Modify: `src/mastra/tools/monthly/collect-monthly-data.tool.ts`
- Modify: `src/mastra/tools/monthly/create-monthly-report.tool.ts`
- Modify: `src/mastra/mastra.service.ts`

**Interfaces:**
- Consumes: `MonthlyClosingService` in Mastra Service
- Produces: Updated tools that call `MonthlyClosingService`

- [ ] **Step 1: Update tool collect-monthly-data**
  Modify `src/mastra/tools/monthly/collect-monthly-data.tool.ts` to utilize `MonthlyClosingService` for upserting draft:
  ```typescript
  import { createTool } from '@mastra/core/tools';
  import { z } from 'zod';
  import { MonthlyClosingService } from '../../../domain/monthly-closing/monthly-closing.service';

  export function createCollectMonthlyDataTool(
    monthlyClosingService: MonthlyClosingService,
  ) {
    return createTool({
      id: 'collect-monthly-data',
      description: 'Thu thập dữ liệu thanh toán hàng tháng cho một lớp và lưu vào nháp',
      inputSchema: z.object({
        classCode: z.string().describe('Mã lớp'),
        billingMonth: z.string().describe('Tháng thanh toán (VD: 2026-07)'),
      }),
      outputSchema: z.any(),
      execute: async (input) => {
        const draft = await monthlyClosingService.createOrUpdateDraft(
          input.classCode,
          input.billingMonth,
        );

        const report = JSON.parse(draft.ReportJson);
        const paidList = report.students.filter((s: any) => s.status === 'paid');
        const unpaidList = report.students.filter((s: any) => s.status !== 'paid');

        return {
          classCode: draft.ClassCode,
          billingMonth: draft.BillingMonth,
          className: report.className,
          feeAmount: report.feeAmount || 0,
          totalStudents: draft.TotalStudents,
          paidList,
          unpaidList,
          totalExpected: draft.ExpectedRevenue,
          totalCollected: draft.CollectedRevenue,
          totalOutstanding: draft.OutstandingDebt,
          closingCode: draft.Code,
        };
      },
    });
  }
  ```

- [ ] **Step 2: Update tool create-monthly-report**
  Modify `src/mastra/tools/monthly/create-monthly-report.tool.ts` to query or create draft:
  ```typescript
  import { createTool } from '@mastra/core/tools';
  import { z } from 'zod';
  import { MonthlyClosingService } from '../../../domain/monthly-closing/monthly-closing.service';

  export function createCreateMonthlyReportTool(
    monthlyClosingService: MonthlyClosingService,
  ) {
    return createTool({
      id: 'create-monthly-report',
      description: 'Tạo báo cáo chốt sổ tháng cho một lớp dưới dạng nháp và lưu trữ',
      inputSchema: z.object({
        classCode: z.string().describe('Mã lớp'),
        billingMonth: z.string().describe('Tháng báo cáo (VD: 2026-07)'),
      }),
      outputSchema: z.any(),
      execute: async (input) => {
        const draft = await monthlyClosingService.createOrUpdateDraft(
          input.classCode,
          input.billingMonth,
        );

        const collectionRate = draft.ExpectedRevenue > 0
          ? Math.round((draft.CollectedRevenue / draft.ExpectedRevenue) * 100)
          : 0;

        return {
          classCode: draft.ClassCode,
          className: draft.Name,
          billingMonth: draft.BillingMonth,
          totalStudents: draft.TotalStudents,
          expectedRevenue: draft.ExpectedRevenue,
          collectedRevenue: draft.CollectedRevenue,
          outstandingDebt: draft.OutstandingDebt,
          collectionRate,
          status: draft.Status,
          reportJson: draft.ReportJson,
          closingCode: draft.Code,
        };
      },
    });
  }
  ```

- [ ] **Step 3: Update MastraService injections**
  Modify `src/mastra/mastra.service.ts`:
  1. Inject `MonthlyClosingService` in the constructor.
  2. Pass `this.monthlyClosingService` instead of `this.classesService, this.invoicesService` to the tools.
  ```typescript
  // In constructor
  private readonly monthlyClosingService: MonthlyClosingService,

  // In onModuleInit where tools are initialized
  collectMonthlyData: createCollectMonthlyDataTool(
    this.monthlyClosingService,
  ),
  createMonthlyReport: createCreateMonthlyReportTool(
    this.monthlyClosingService,
  ),
  ```

- [ ] **Step 4: Verify build**
  Run: `npm run build`
  Expected: Builds correctly with 0 issues.

- [ ] **Step 5: Commit changes**
  Run:
  ```bash
  git add src/mastra/tools/monthly/ src/mastra/mastra.service.ts
  git commit -m "feat(mastra): integrate MonthlyClosingService into monthly closing tools"
  ```

---

### Task 7: Comprehensive Unit Testing for Reports & Closings

**Files:**
- Create: `src/domain/monthly-closing/monthly-closing.service.spec.ts`
- Create: `src/domain/reports/reports.service.spec.ts`

- [ ] **Step 1: Write test for MonthlyClosingService**
  Create `src/domain/monthly-closing/monthly-closing.service.spec.ts`:
  ```typescript
  import { Test, TestingModule } from '@nestjs/testing';
  import { MonthlyClosingService } from './monthly-closing.service';
  import { SupabaseService } from '../../integrations/supabase/supabase.service';
  import { AuditService } from '../common/audit.service';
  import { ClassesService } from '../classes/classes.service';
  import { InvoicesService } from '../invoices/invoices.service';

  describe('MonthlyClosingService', () => {
    let service: MonthlyClosingService;

    const mockSupabaseClient = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      like: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null }),
      single: jest.fn().mockResolvedValue({ data: { Code: 'MCL001', Status: 'draft' } }),
      range: jest.fn().mockReturnThis(),
    };

    const mockSupabaseService = {
      getClient: () => mockSupabaseClient,
    };

    const mockAuditService = { log: jest.fn().mockResolvedValue(undefined) };
    const mockClassesService = {
      findByCode: jest.fn().mockResolvedValue({ Name: 'Test Class', TeacherCode: 'TCH001', FeeAmount: 100000 }),
      getStudentCount: jest.fn().mockResolvedValue(10),
    };
    const mockInvoicesService = {
      findAll: jest.fn().mockResolvedValue({ data: [] }),
    };

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MonthlyClosingService,
          { provide: SupabaseService, useValue: mockSupabaseService },
          { provide: AuditService, useValue: mockAuditService },
          { provide: ClassesService, useValue: mockClassesService },
          { provide: InvoicesService, useValue: mockInvoicesService },
        ],
      }).compile();

      service = module.get<MonthlyClosingService>(MonthlyClosingService);
    });

    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });
  ```

- [ ] **Step 2: Run Tests**
  Run: `npx jest src/domain/monthly-closing/monthly-closing.service.spec.ts`
  Expected: Tests pass.

- [ ] **Step 3: Write test for ReportsService**
  Create `src/domain/reports/reports.service.spec.ts`:
  ```typescript
  import { Test, TestingModule } from '@nestjs/testing';
  import { ReportsService } from './reports.service';
  import { SupabaseService } from '../../integrations/supabase/supabase.service';
  import { ClassesService } from '../classes/classes.service';
  import { InvoicesService } from '../invoices/invoices.service';
  import { MonthlyClosingService } from '../monthly-closing/monthly-closing.service';

  describe('ReportsService', () => {
    let service: ReportsService;

    const mockSupabaseClient = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null }),
    };

    const mockSupabaseService = {
      getClient: () => mockSupabaseClient,
    };

    const mockClassesService = {
      findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      getStudentCount: jest.fn().mockResolvedValue(0),
    };
    const mockInvoicesService = {
      findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    };
    const mockMonthlyClosingService = {
      findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    };

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ReportsService,
          { provide: SupabaseService, useValue: mockSupabaseService },
          { provide: ClassesService, useValue: mockClassesService },
          { provide: InvoicesService, useValue: mockInvoicesService },
          { provide: MonthlyClosingService, useValue: mockMonthlyClosingService },
        ],
      }).compile();

      service = module.get<ReportsService>(ReportsService);
    });

    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });
  ```

- [ ] **Step 4: Run all reports tests**
  Run: `npx jest src/domain/reports/reports.service.spec.ts`
  Expected: Tests pass.

- [ ] **Step 5: Commit changes**
  Run:
  ```bash
  git add src/domain/monthly-closing/monthly-closing.service.spec.ts src/domain/reports/reports.service.spec.ts
  git commit -m "test(reports): add unit tests for monthly closing and reports service"
  ```
