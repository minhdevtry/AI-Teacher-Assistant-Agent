import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../../integrations/supabase/supabase.service';
import { AuditService } from '../common/audit.service';
import { CodeGenerator } from '../common/code-generator';
import { CreateUserDto, UpdateUserDto } from './dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: {
    role?: string;
    classCode?: string;
    page?: number;
    limit?: number;
  }) {
    const client = this.supabaseService.getClient();
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let builder = client
      .from('User')
      .select('*', { count: 'exact' })
      .eq('IsActive', 1)
      .range(from, to)
      .order('Id', { ascending: false });

    if (query.role) {
      builder = builder.eq('Role', query.role);
    }
    if (query.classCode) {
      builder = builder.eq('ClassCode', query.classCode);
    }

    const { data, count, error } = await builder;
    if (error) {
      this.logger.error(`findAll failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch users');
    }

    return { data: data ?? [], total: count ?? 0, page, limit };
  }

  async findById(id: number) {
    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('User')
      .select('*')
      .eq('Id', id)
      .eq('IsActive', 1)
      .maybeSingle();

    if (error) {
      this.logger.error(`findById(${id}) failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch user');
    }
    if (!data) throw new NotFoundException(`User with Id ${id} not found`);
    return data;
  }

  async findByCode(code: string) {
    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('User')
      .select('*')
      .eq('Code', code)
      .eq('IsActive', 1)
      .maybeSingle();

    if (error) {
      this.logger.error(`findByCode(${code}) failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch user');
    }
    if (!data) throw new NotFoundException(`User with Code ${code} not found`);
    return data;
  }

  async search(query: string) {
    const client = this.supabaseService.getClient();
    // Escape LIKE special characters (% _ \) to prevent injection
    const safe = query.replace(/[%_\\]/g, (c) => (c === '%' || c === '_' ? "\\" + c : "\\\\" + c));
    const { data, error } = await client
      .from('User')
      .select('*')
      .eq('IsActive', 1)
      .or(
        `Name.ilike.%${safe}%,Nickname.ilike.%${safe}%,Phone.ilike.%${safe}%`,
      )
      .order('Id', { ascending: false });

    if (error) {
      this.logger.error(`search("${query}") failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to search users');
    }
    return data ?? [];
  }

  async create(dto: CreateUserDto) {
    const client = this.supabaseService.getClient();

    const prefix = dto.Role === 'teacher' ? 'TCH' : dto.Role === 'student' ? 'STD' : 'PRT';
    const { data: maxRow } = await client
      .from('User')
      .select('Code')
      .like('Code', `${prefix}%`)
      .order('Id', { ascending: false })
      .limit(1)
      .maybeSingle();

    const code = CodeGenerator.generate(prefix, maxRow?.Code ?? null);

    const { data, error } = await client
      .from('User')
      .insert({
        Name: dto.Name,
        Code: code,
        Role: dto.Role,
        Phone: dto.Phone ?? null,
        ZaloUserId: dto.ZaloUserId ?? null,
        ClassCode: dto.ClassCode ?? null,
        ParentId: dto.ParentId ?? null,
        Nickname: dto.Nickname ?? null,
        Title: dto.Title ?? null,
        Tone: dto.Tone ?? null,
        Description: dto.Description ?? null,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`create user failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to create user');
    }

    await this.auditService.log({
      EntityType: 'User',
      EntityCode: code,
      Action: 'CREATE',
      NewValue: JSON.stringify(data),
      ActorType: 'system',
    });

    this.logger.log(`User created: ${code} (${dto.Role})`);
    return data;
  }

  async update(code: string, dto: UpdateUserDto) {
    const existing = await this.findByCode(code);

    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('User')
      .update({ ...dto, ModifiedAt: new Date().toISOString() })
      .eq('Code', code)
      .select()
      .single();

    if (error) {
      this.logger.error(`update user ${code} failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to update user');
    }

    await this.auditService.log({
      EntityType: 'User',
      EntityCode: code,
      Action: 'UPDATE',
      OldValue: JSON.stringify(existing),
      NewValue: JSON.stringify(data),
      ActorType: 'system',
    });

    this.logger.log(`User updated: ${code}`);
    return data;
  }

  async softDelete(code: string) {
    const existing = await this.findByCode(code);

    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('User')
      .update({ IsActive: 0, ModifiedAt: new Date().toISOString() })
      .eq('Code', code)
      .select()
      .single();

    if (error) {
      this.logger.error(`softDelete user ${code} failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to soft-delete user');
    }

    await this.auditService.log({
      EntityType: 'User',
      EntityCode: code,
      Action: 'SOFT_DELETE',
      OldValue: JSON.stringify(existing),
      ActorType: 'system',
    });

    this.logger.log(`User soft-deleted: ${code}`);
    return data;
  }

  async findByZaloUserId(zaloUserId: string) {
    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('User')
      .select('*')
      .eq('ZaloUserId', zaloUserId)
      .eq('IsActive', 1)
      .maybeSingle();

    if (error) {
      this.logger.error(`findByZaloUserId(${zaloUserId}) failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to lookup user by Zalo ID');
    }
    return data;
  }

  async getStudentsByClass(classCode: string) {
    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('User')
      .select('*')
      .eq('ClassCode', classCode)
      .eq('Role', 'student')
      .eq('IsActive', 1)
      .order('Name');

    if (error) {
      this.logger.error(`getStudentsByClass(${classCode}) failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch students by class');
    }
    return data ?? [];
  }
}
