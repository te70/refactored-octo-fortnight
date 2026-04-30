import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { GrnStoreService } from './grn-store.service';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
  SupplierResponseDto,
  CreateGrnDto,
  GrnResponseDto,
  ApproveGrnDto,
  RejectGrnDto,
  CreateStoreIssueDto,
  ApproveStoreIssueDto,
  StoreIssueResponseDto,
  StockValuationDto,
  SupplierPerformanceDto,
} from './dto/grn-store.dto';
import { Division } from '@prisma/client';

@Controller('grn')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GrnStoreController {
  constructor(private readonly grnStoreService: GrnStoreService) {}

  // ==================== SUPPLIERS ====================

  @Post('suppliers')
  @Roles('MANAGER', 'OWNER')
  @HttpCode(HttpStatus.CREATED)
  async createSupplier(
    @Request() req,
    @Body() createSupplierDto: CreateSupplierDto,
  ): Promise<SupplierResponseDto> {
    return this.grnStoreService.createSupplier(createSupplierDto, req.user.userId);
  }

  @Get('suppliers')
  async getAllSuppliers(): Promise<SupplierResponseDto[]> {
    return this.grnStoreService.getAllSuppliers();
  }

  @Get('suppliers/:id')
  async getSupplierById(@Param('id') id: string): Promise<SupplierResponseDto> {
    return this.grnStoreService.getSupplierById(id);
  }

  @Put('suppliers/:id')
  @Roles('MANAGER', 'OWNER')
  async updateSupplier(
    @Request() req,
    @Param('id') id: string,
    @Body() updateSupplierDto: UpdateSupplierDto,
  ): Promise<SupplierResponseDto> {
    return this.grnStoreService.updateSupplier(id, updateSupplierDto, req.user.userId);
  }

  @Get('suppliers/performance/all')
  @Roles('MANAGER', 'OWNER')
  async getSupplierPerformance(): Promise<SupplierPerformanceDto[]> {
    return this.grnStoreService.getSupplierPerformance();
  }

  // ==================== GRNs ====================

  @Post()
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @HttpCode(HttpStatus.CREATED)
  async createGrn(@Request() req, @Body() createGrnDto: CreateGrnDto): Promise<GrnResponseDto> {
    return this.grnStoreService.createGrn(createGrnDto, req.user.userId);
  }

  @Get()
  async getAllGrns(
    @Query('status') status?: string,
    @Query('supplierId') supplierId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<GrnResponseDto[]> {
    return this.grnStoreService.getAllGrns(
      status,
      supplierId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get(':id')
  async getGrnById(@Param('id') id: string): Promise<GrnResponseDto> {
    return this.grnStoreService.getGrnById(id);
  }

  @Post(':id/approve')
  @Roles('MANAGER', 'OWNER')
  async approveGrn(
    @Request() req,
    @Param('id') id: string,
    @Body() approveGrnDto: ApproveGrnDto,
  ): Promise<GrnResponseDto> {
    return this.grnStoreService.approveGrn(id, approveGrnDto, req.user.userId);
  }

  @Post(':id/reject')
  @Roles('MANAGER', 'OWNER')
  async rejectGrn(
    @Request() req,
    @Param('id') id: string,
    @Body() rejectGrnDto: RejectGrnDto,
  ): Promise<GrnResponseDto> {
    return this.grnStoreService.rejectGrn(id, rejectGrnDto, req.user.userId);
  }

  // ==================== STORE ISSUES (TRANSFERS) ====================

  @Post('store-issues')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @HttpCode(HttpStatus.CREATED)
  async createStoreIssue(
    @Request() req,
    @Body() createStoreIssueDto: CreateStoreIssueDto,
  ): Promise<StoreIssueResponseDto> {
    return this.grnStoreService.createStoreIssue(createStoreIssueDto, req.user.userId);
  }

  @Get('store-issues')
  async getAllStoreIssues(
    @Query('status') status?: string,
    @Query('fromDivision') fromDivision?: Division,
    @Query('toDivision') toDivision?: Division,
  ): Promise<StoreIssueResponseDto[]> {
    return this.grnStoreService.getAllStoreIssues(status, fromDivision, toDivision);
  }

  @Get('store-issues/:id')
  async getStoreIssueById(@Param('id') id: string): Promise<StoreIssueResponseDto> {
    return this.grnStoreService.getStoreIssueById(id);
  }

  @Post('store-issues/:id/approve')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  async approveStoreIssue(
    @Request() req,
    @Param('id') id: string,
    @Body() approveStoreIssueDto: ApproveStoreIssueDto,
  ): Promise<StoreIssueResponseDto> {
    return this.grnStoreService.approveStoreIssue(id, approveStoreIssueDto, req.user.userId);
  }

  // ==================== STOCK VALUATION ====================

  @Get('valuation/:division')
  @Roles('MANAGER', 'OWNER')
  async getStockValuation(@Param('division') division: Division): Promise<StockValuationDto> {
    return this.grnStoreService.getStockValuation(division);
  }
}
