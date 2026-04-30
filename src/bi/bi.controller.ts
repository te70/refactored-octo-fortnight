import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { BiService } from './bi.service';
import {
  RevenueAnalyticsQueryDto,
  RevenueAnalyticsDto,
  StockVarianceAnalyticsDto,
  StaffPerformanceQueryDto,
  StaffPerformanceDto,
  RevenueForecastQueryDto,
  RevenueForecastDto,
  ProductAnalyticsQueryDto,
  ProductAnalyticsDto,
  DivisionComparisonQueryDto,
  DivisionComparisonDto,
} from './dto/bi.dto';
import { Division } from '@prisma/client';

@Controller('bi')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BiController {
  constructor(private readonly biService: BiService) {}

  // ==================== REVENUE ANALYTICS ====================

  @Get('revenue-analytics')
  @Roles('MANAGER', 'OWNER')
  async getRevenueAnalytics(
    @Query() queryDto: RevenueAnalyticsQueryDto,
  ): Promise<RevenueAnalyticsDto> {
    return this.biService.getRevenueAnalytics(queryDto);
  }

  // ==================== STOCK VARIANCE ANALYTICS ====================

  @Get('stock-variance/:division')
  @Roles('MANAGER', 'OWNER')
  async getStockVarianceAnalytics(
    @Param('division') division: Division,
  ): Promise<StockVarianceAnalyticsDto> {
    return this.biService.getStockVarianceAnalytics(division);
  }

  // ==================== STAFF PERFORMANCE ====================

  @Get('staff-performance')
  @Roles('MANAGER', 'OWNER')
  async getStaffPerformance(
    @Query() queryDto: StaffPerformanceQueryDto,
  ): Promise<StaffPerformanceDto> {
    return this.biService.getStaffPerformance(queryDto);
  }

  // ==================== REVENUE FORECAST ====================

  @Get('revenue-forecast')
  @Roles('MANAGER', 'OWNER')
  async getRevenueForecast(
    @Query() queryDto: RevenueForecastQueryDto,
  ): Promise<RevenueForecastDto> {
    return this.biService.getRevenueForecast(queryDto);
  }

  // ==================== PRODUCT ANALYTICS ====================

  @Get('product-analytics')
  @Roles('MANAGER', 'OWNER')
  async getProductAnalytics(
    @Query() queryDto: ProductAnalyticsQueryDto,
  ): Promise<ProductAnalyticsDto> {
    return this.biService.getProductAnalytics(queryDto);
  }

  // ==================== DIVISION COMPARISON ====================

  @Get('division-comparison')
  @Roles('MANAGER', 'OWNER')
  async getDivisionComparison(
    @Query() queryDto: DivisionComparisonQueryDto,
  ): Promise<DivisionComparisonDto> {
    return this.biService.getDivisionComparison(queryDto);
  }
}