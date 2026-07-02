import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../../integrations/supabase/supabase.service';
import { AuditService } from '../common/audit.service';
import { CodeGenerator } from '../common/code-generator';
import { CreateClassDto, UpdateClassDto } from './dto';

@Injectable()
export class ClassesService {
  private readonly logger = new Logger(ClassesService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: {
    teacherCode?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const client = this.supabaseService.getClient();
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let builder = client
      .from('Class')
      .select('*', { count: 'exact' })
      .eq('IsActive', 1)
      .range(from, to)
      .order('Id', { ascending: false });

    if (query.teacherCode) {
      builder = builder.eq('TeacherCode', query.teacherCode);
    }
    if (query.status) {
      builder = builder.eq('Status', query.status);
    }

    const { data, count, error } = await builder;
    if (error) {
      this.logger.error(`findAll classes failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch classes');
    }

    return { data: data ?? [], total: count ?? 0, page, limit };
  }

  async findByCode(code: string) {
    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('Class')
      .select('*')
      .eq('Code', code)
      .eq('IsActive', 1)
      .maybeSingle();

    if (error) {
      this.logger.error(`findByCode(${code}) failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch class');
    }
    if (!data) throw new NotFoundException(`Class with Code ${code} not found`);
    return data;
  }

  async create(dto: CreateClassDto) {
    const client = this.supabaseService.getClient();

    const { data: maxRow } = await client
      .from('Class')
      .select('Code')
      .like('Code', 'CLS%')
      .order('Id', { ascending: false })
      .limit(1)
      .maybeSingle();

    const code = CodeGenerator.generate('CLS', maxRow?.Code ?? null);

    const { data, error } = await client
      .from('Class')
      .insert({
        Name: dto.Name,
        Code: code,
        TeacherCode: dto.TeacherCode,
        Subject: dto.Subject ?? '',
        FeeAmount: dto.FeeAmount ?? 0,
        FeeType: dto.FeeType ?? 'monthly',
        Schedule: dto.Schedule ?? null,
        Description: dto.Description ?? null,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`createClass failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to create class');
    }

    await this.auditService.log({
      TeacherCode: dto.TeacherCode,
      EntityType: 'Class',
      EntityCode: code,
      Action: 'CREATE',
      NewValue: JSON.stringify(data),
      ActorType: 'system',
    });

    this.logger.log(`Class created: ${code} (teacher: ${dto.TeacherCode})`);
    return data;
  }

  async update(code: string, dto: UpdateClassDto) {
    const existing = await this.findByCode(code);

    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('Class')
      .update({ ...dto, ModifiedAt: new Date().toISOString() })
      .eq('Code', code)
      .select()
      .single();

    if (error) {
      this.logger.error(`update(${code}) failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to update class');
    }

    await this.auditService.log({
      TeacherCode: existing.TeacherCode,
      EntityType: 'Class',
      EntityCode: code,
      Action: 'UPDATE',
      OldValue: JSON.stringify(existing),
      NewValue: JSON.stringify(data),
      ActorType: 'system',
    });

    this.logger.log(`Class updated: ${code}`);
    return data;
  }

  async softDelete(code: string) {
    const existing = await this.findByCode(code);

    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('Class')
      .update({ IsActive: 0, ModifiedAt: new Date().toISOString() })
      .eq('Code', code)
      .select()
      .single();

    if (error) {
      this.logger.error(`softDelete(${code}) failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to soft-delete class');
    }

    await this.auditService.log({
      TeacherCode: existing.TeacherCode,
      EntityType: 'Class',
      EntityCode: code,
      Action: 'SOFT_DELETE',
      OldValue: JSON.stringify(existing),
      ActorType: 'system',
    });

    this.logger.log(`Class soft-deleted: ${code}`);
    return data;
  }

  async getStudentCount(classCode: string) {
    const client = this.supabaseService.getClient();
    const { count, error } = await client
      .from('User')
      .select('*', { count: 'exact', head: true })
      .eq('ClassCode', classCode)
      .eq('Role', 'student')
      .eq('IsActive', 1);

    if (error) {
      this.logger.error(`getStudentCount(${classCode}) failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to count students');
    }
    return count ?? 0;
  }

  async updateFee(classCode: string, feeAmount: number, feeType: string) {
    const existing = await this.findByCode(classCode);

    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('Class')
      .update({
        FeeAmount: feeAmount,
        FeeType: feeType,
        ModifiedAt: new Date().toISOString(),
      })
      .eq('Code', classCode)
      .select()
      .single();

    if (error) {
      this.logger.error(`updateFee(${classCode}) failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to update class fee');
    }

    await this.auditService.log({
      TeacherCode: existing.TeacherCode,
      EntityType: 'Class',
      EntityCode: classCode,
      Action: 'UPDATE_FEE',
      OldValue: JSON.stringify({
        FeeAmount: existing.FeeAmount,
        FeeType: existing.FeeType,
      }),
      NewValue: JSON.stringify({ FeeAmount: feeAmount, FeeType: feeType }),
      ActorType: 'system',
    });

    this.logger.log(`Class ${classCode} fee updated: ${feeAmount} (${feeType})`);
    return data;
  }
}
