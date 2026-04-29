import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { Division } from '@prisma/client';

export class OpenShiftDto {
  @IsEnum(Division)
  division: Division;

  @IsNumber()
  @Min(0)
  openingFloat: number;
}

export class CloseShiftDto {
  @IsNumber()
  @Min(0)
  closingCount: number;

  @IsOptional()
  @IsNumber()
  mpesaTotal?: number;

  @IsOptional()
  managerPin?: string; // Required if variance exceeds threshold
}

export class ShiftSummaryDto {
  id: string;
  division: Division;
  user: {
    id: string;
    name: string;
  };
  openedAt: Date;
  closedAt: Date | null;
  openingFloat: number;
  closingCount: number | null;
  mpesaTotal: number | null;
  variance: number | null;
  totalSales: number;
  totalTransactions: number;
  cashSales: number;
  mpesaSales: number;
}
