import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../integrations/supabase/supabase.service';
import { CodeGenerator } from './code-generator';

export interface AuditLogEntry {
  TeacherCode?: string;
  EntityType: string;
  EntityCode: string;
  Action: string;
  OldValue?: string;
  NewValue?: string;
  ActorType: string;
  ActorDetail?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async log(entry: AuditLogEntry): Promise<void> {
    const client = this.supabaseService.getClient();

    const { data: maxRow } = await client
      .from('AuditLog')
      .select('Code')
      .like('Code', 'AUD%')
      .order('Id', { ascending: false })
      .limit(1)
      .maybeSingle();

    const code = CodeGenerator.generate('AUD', maxRow?.Code ?? null);

    await client.from('AuditLog').insert({
      Name: `${entry.Action} ${entry.EntityType} ${entry.EntityCode}`,
      Code: code,
      Description: `Audit log for ${entry.Action} on ${entry.EntityType}`,
      ...entry,
    });
  }
}
