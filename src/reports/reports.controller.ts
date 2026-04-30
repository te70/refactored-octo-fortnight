import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Header,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { ReportsService } from './reports.service';
import {
  DailyPlQueryDto,
  DailyPlReportDto,
  StockReportQueryDto,
  StockReportDto,
  ShiftSummaryDto,
  MpesaReconciliationQueryDto,
  MpesaReconciliationReportDto,
  SalesSummaryQueryDto,
  SalesSummaryDto,
} from './dto/reports.dto';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // ==================== DAILY P&L ====================

  @Get('daily-pl')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  async getDailyPl(@Query() queryDto: DailyPlQueryDto): Promise<DailyPlReportDto> {
    return this.reportsService.getDailyPl(queryDto);
  }

  @Get('daily-pl/pdf')
  @Roles('MANAGER', 'OWNER')
  @Header('Content-Type', 'text/html')
  async exportDailyPlPdf(@Query() queryDto: DailyPlQueryDto): Promise<string> {
    return this.reportsService.exportDailyPlPdf(queryDto);
  }

  // ==================== STOCK REPORT ====================

  @Get('stock')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  async getStockReport(@Query() queryDto: StockReportQueryDto): Promise<StockReportDto> {
    return this.reportsService.getStockReport(queryDto);
  }

  // ==================== SHIFT SUMMARY ====================

  @Get('shift/:shiftId')
  async getShiftSummary(@Param('shiftId') shiftId: string): Promise<ShiftSummaryDto> {
    return this.reportsService.getShiftSummary(shiftId);
  }

  // ==================== MPESA RECONCILIATION ====================

  @Get('mpesa-reconciliation')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  async getMpesaReconciliation(
    @Query() queryDto: MpesaReconciliationQueryDto,
  ): Promise<MpesaReconciliationReportDto> {
    return this.reportsService.getMpesaReconciliation(queryDto);
  }

  // ==================== SALES SUMMARY ====================

  @Get('sales-summary')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  async getSalesSummary(
    @Query() queryDto: SalesSummaryQueryDto,
  ): Promise<SalesSummaryDto> {
    return this.reportsService.getSalesSummary(queryDto);
  }
}
