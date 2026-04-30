import {
  IsString,
  IsEnum,
  IsOptional,
  IsDateString,
  IsNumber,
  Min,
} from 'class-validator';
import { Division } from '@prisma/client';

// ==================== REVENUE ANALYTICS DTOs ====================

export class RevenueAnalyticsQueryDto {
  @IsEnum(Division)
  division: Division;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}

export class RevenueAnalyticsDto {
  division: Division;
  startDate: Date;
  endDate: Date;
  totalRevenue: number;
  totalTransactions: number;
  averageTransactionValue: number;
  dailyRevenue: Array<{
    date: Date;
    revenue: number;
    transactions: number;
  }>;
  revenueByPaymentMethod: {
    cash: number;
    mpesa: number;
  };
  topProducts: Array<{
    productId: string;
    productName: string;
    quantitySold: number;
    revenue: number;
  }>;
  peakHours: Array<{
    hour: number;
    transactions: number;
    revenue: number;
  }>;
}

// ==================== STOCK VARIANCE ANALYTICS DTOs ====================

export class StockVarianceAnalyticsDto {
  division: Division;
  totalItems: number;
  itemsWithVariance: number;
  totalVarianceValue: number;
  varianceHeatmap: Array<{
    stockItemId: string;
    stockItemName: string;
    expectedStock: number;
    actualStock: number;
    variance: number;
    variancePercentage: number;
    varianceValue: number;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  }>;
  frequentVarianceItems: Array<{
    stockItemId: string;
    stockItemName: string;
    varianceCount: number;
    totalVariance: number;
  }>;
}

// ==================== STAFF PERFORMANCE DTOs ====================

export class StaffPerformanceQueryDto {
  @IsOptional()
  @IsEnum(Division)
  division?: Division;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}

export class StaffPerformanceDto {
  division?: Division;
  startDate: Date;
  endDate: Date;
  staffMetrics: Array<{
    userId: string;
    userName: string;
    role: string;
    totalShifts: number;
    totalRevenue: number;
    averageRevenuePerShift: number;
    totalTransactions: number;
    averageTransactionsPerShift: number;
    cashVariance: number;
    voidCount: number;
    performanceScore: number;
  }>;
  topPerformers: Array<{
    userId: string;
    userName: string;
    totalRevenue: number;
  }>;
}

// ==================== REVENUE FORECAST DTOs ====================

export class RevenueForecastQueryDto {
  @IsEnum(Division)
  division: Division;

  @IsOptional()
  @IsNumber()
  @Min(1)
  daysToForecast?: number; // Default 7
}

export class RevenueForecastDto {
  division: Division;
  historicalData: Array<{
    date: Date;
    revenue: number;
  }>;
  forecast: Array<{
    date: Date;
    predictedRevenue: number;
    confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  }>;
  trend: 'INCREASING' | 'STABLE' | 'DECREASING';
  averageDailyRevenue: number;
  projectedWeeklyRevenue: number;
}

// ==================== PRODUCT ANALYTICS DTOs ====================

export class ProductAnalyticsQueryDto {
  @IsEnum(Division)
  division: Division;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  topN?: number; // Default 20
}

export class ProductAnalyticsDto {
  division: Division;
  startDate: Date;
  endDate: Date;
  totalProducts: number;
  productPerformance: Array<{
    productId: string;
    productName: string;
    category: string;
    quantitySold: number;
    revenue: number;
    profit: number;
    profitMargin: number;
    salesVelocity: number; // Units per day
    trend: 'TRENDING_UP' | 'STEADY' | 'TRENDING_DOWN';
  }>;
  categoryPerformance: Array<{
    category: string;
    revenue: number;
    profit: number;
    itemsSold: number;
  }>;
  slowMovingProducts: Array<{
    productId: string;
    productName: string;
    daysSinceLastSale: number;
    currentStock: number;
  }>;
}

// ==================== DIVISION COMPARISON DTOs ====================

export class DivisionComparisonQueryDto {
  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}

export class DivisionComparisonDto {
  startDate: Date;
  endDate: Date;
  divisions: Array<{
    division: Division;
    revenue: number;
    transactions: number;
    averageTransactionValue: number;
    profitMargin: number;
    cashVariance: number;
    mpesaDiscrepancy: number;
    alertCount: number;
  }>;
  bestPerforming: {
    division: Division;
    metric: string;
    value: number;
  };
}

// ==================== CUSTOMER INSIGHTS DTOs ====================

export class CustomerInsightsDto {
  division: Division;
  startDate: Date;
  endDate: Date;
  totalCustomers: number; // Unique transactions
  averageSpendPerCustomer: number;
  repeatCustomerRate: number;
  peakDays: Array<{
    dayOfWeek: string;
    transactions: number;
    revenue: number;
  }>;
  averageBasketSize: number;
}