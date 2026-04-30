import { IsString, IsEnum, IsOptional, IsDateString } from 'class-validator';
import { Division } from '@prisma/client';

// ==================== DAILY P&L DTOs ====================

export class DailyPlQueryDto {
  @IsEnum(Division)
  division: Division;

  @IsDateString()
  date: string;
}

export class DailyPlReportDto {
  division: Division;
  date: Date;
  revenue: {
    cash: number;
    mpesa: number;
    total: number;
  };
  cogs: number;
  grossProfit: number;
  grossProfitMargin: number;
  transactionCount: number;
  breakdown: Array<{
    category: string;
    revenue: number;
    cogs: number;
    profit: number;
    margin: number;
  }>;
}

// ==================== STOCK REPORT DTOs ====================

export class StockReportQueryDto {
  @IsEnum(Division)
  division: Division;

  @IsOptional()
  @IsDateString()
  date?: string;
}

export class StockReportDto {
  division: Division;
  date: Date;
  totalValue: number;
  totalItems: number;
  lowStockItems: number;
  items: Array<{
    name: string;
    sku: string;
    currentStock: number;
    unit: string;
    costPrice: number;
    stockValue: number;
    reorderLevel: number;
    isLowStock: boolean;
  }>;
  movements: Array<{
    stockItemName: string;
    movementType: string;
    quantity: number;
    timestamp: Date;
  }>;
}

// ==================== SHIFT SUMMARY DTOs ====================

export class ShiftSummaryDto {
  shiftId: string;
  user: {
    name: string;
    role: string;
  };
  division: Division;
  openedAt: Date;
  closedAt?: Date;
  openingFloat: number;
  closingCount?: number;
  mpesaTotal?: number;
  variance?: number;
  revenue: {
    cash: number;
    mpesa: number;
    total: number;
  };
  transactionCount: number;
  voidCount: number;
  topProducts: Array<{
    productName: string;
    quantitySold: number;
    revenue: number;
  }>;
}

// ==================== MPESA RECONCILIATION DTOs ====================

export class MpesaReconciliationQueryDto {
  @IsOptional()
  @IsEnum(Division)
  division?: Division;

  @IsDateString()
  date: string;
}

export class MpesaReconciliationReportDto {
  division?: Division;
  date: Date;
  posTotal: number;
  darajaTotal: number;
  variance: number;
  matchedCount: number;
  unmatchedPosCount: number;
  unmatchedDarajaCount: number;
  matched: Array<{
    transactionRef: string;
    amount: number;
    timestamp: Date;
  }>;
  unmatchedPos: Array<{
    transactionId: string;
    mpesaRef: string;
    amount: number;
    timestamp: Date;
  }>;
  unmatchedDaraja: Array<{
    transactionRef: string;
    amount: number;
    msisdn: string;
    timestamp: Date;
  }>;
}

// ==================== SALES SUMMARY DTOs ====================

export class SalesSummaryQueryDto {
  @IsEnum(Division)
  division: Division;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}

export class SalesSummaryDto {
  division: Division;
  startDate: Date;
  endDate: Date;
  totalRevenue: number;
  totalTransactions: number;
  averageTransactionValue: number;
  paymentMethods: {
    cash: number;
    mpesa: number;
  };
  topProducts: Array<{
    name: string;
    quantitySold: number;
    revenue: number;
  }>;
  dailyBreakdown: Array<{
    date: Date;
    revenue: number;
    transactions: number;
  }>;
}
