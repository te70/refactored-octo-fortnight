import {
  IsString,
  IsEnum,
  IsOptional,
  IsUUID,
  IsDateString,
} from 'class-validator';
import { Division } from '@prisma/client';

// ==================== ALERT DTOs ====================

export enum AlertType {
  STOCK_VARIANCE = 'STOCK_VARIANCE',
  CASH_VARIANCE = 'CASH_VARIANCE',
  MPESA_DISCREPANCY = 'MPESA_DISCREPANCY',
  LOW_STOCK = 'LOW_STOCK',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  SYSTEM = 'SYSTEM',
}

export enum AlertSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

export enum AlertStatus {
  OPEN = 'OPEN',
  INVESTIGATING = 'INVESTIGATING',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED',
}

export class CreateAlertDto {
  @IsEnum(AlertType)
  type: AlertType;

  @IsEnum(AlertSeverity)
  severity: AlertSeverity;

  @IsString()
  description: string;

  @IsOptional()
  @IsEnum(Division)
  division?: Division;
}

export class UpdateAlertDto {
  @IsOptional()
  @IsEnum(AlertStatus)
  status?: AlertStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class InvestigateAlertDto {
  @IsString()
  notes: string;
}

export class ResolveAlertDto {
  @IsString()
  resolution: string;
}

export class AlertResponseDto {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  description: string;
  division?: Division;
  raisedAt: Date;
}

// ==================== ALERT QUERY DTOs ====================

export class AlertQueryDto {
  @IsOptional()
  @IsEnum(AlertType)
  type?: AlertType;

  @IsOptional()
  @IsEnum(AlertSeverity)
  severity?: AlertSeverity;

  @IsOptional()
  @IsEnum(AlertStatus)
  status?: AlertStatus;

  @IsOptional()
  @IsEnum(Division)
  division?: Division;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

// ==================== ALERT STATISTICS DTOs ====================

export class AlertStatsDto {
  total: number;
  open: number;
  investigating: number;
  resolved: number;
  dismissed: number;
  byType: Record<AlertType, number>;
  bySeverity: Record<AlertSeverity, number>;
  byDivision: Record<string, number>;
  averageResolutionTime: number; // in hours
  oldestOpenAlert?: {
    id: string;
    description: string;
    raisedAt: Date;
    ageInHours: number;
  };
}