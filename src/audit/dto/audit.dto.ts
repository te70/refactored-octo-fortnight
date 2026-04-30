import {
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  IsUUID,
} from 'class-validator';

// ==================== AUDIT QUERY DTOs ====================

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  APPROVE_GRN = 'APPROVE_GRN',
  REJECT_GRN = 'REJECT_GRN',
  APPROVE_STORE_ISSUE = 'APPROVE_STORE_ISSUE',
  INVESTIGATE_ALERT = 'INVESTIGATE_ALERT',
  RESOLVE_ALERT = 'RESOLVE_ALERT',
  DISMISS_ALERT = 'DISMISS_ALERT',
  OPEN_SHIFT = 'OPEN_SHIFT',
  CLOSE_SHIFT = 'CLOSE_SHIFT',
  VOID_TRANSACTION = 'VOID_TRANSACTION',
}

export class AuditQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @IsOptional()
  @IsString()
  tableName?: string;

  @IsOptional()
  @IsUUID()
  recordId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class AuditResponseDto {
  id: string;
  userId: string;
  userName: string;
  action: string;
  tableName: string;
  recordId: string;
  beforeJson?: Record<string, any>;
  afterJson?: Record<string, any>;
  createdAt: Date;
}

// ==================== AUDIT STATISTICS DTOs ====================

export class AuditStatsDto {
  totalLogs: number;
  byAction: Record<string, number>;
  byTable: Record<string, number>;
  byUser: Array<{
    userId: string;
    userName: string;
    actionCount: number;
  }>;
  recentActivity: AuditResponseDto[];
}

// ==================== EXPORT DTOs ====================

export class ExportAuditDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @IsOptional()
  @IsString()
  tableName?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}