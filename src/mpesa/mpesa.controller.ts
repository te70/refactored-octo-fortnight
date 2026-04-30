import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { MpesaService } from './mpesa.service';
import {
  StkPushDto,
  StkPushResponseDto,
  MpesaCallbackDto,
  C2BCallbackDto,
  ReconcileDto,
  ReconciliationResultDto,
  MpesaTransactionQueryDto,
  MpesaTransactionResponseDto,
} from './dto/mpesa.dto';

@Controller('mpesa')
export class MpesaController {
  private readonly logger = new Logger(MpesaController.name);

  constructor(private readonly mpesaService: MpesaService) {}

  // ==================== STK PUSH ====================

  @Post('stk-push')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECEPTIONIST', 'CASHIER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @HttpCode(HttpStatus.OK)
  async initiateStkPush(
    @Request() req,
    @Body() stkPushDto: StkPushDto,
  ): Promise<StkPushResponseDto> {
    return this.mpesaService.initiateStkPush(stkPushDto, req.user.userId);
  }

  // ==================== CALLBACKS (NO AUTH - Called by Safaricom) ====================

  @Post('callback/stk')
  @HttpCode(HttpStatus.OK)
  async stkCallback(@Body() callbackData: MpesaCallbackDto): Promise<{ ResultCode: number }> {
    this.logger.log('STK Push callback received');
    
    try {
      await this.mpesaService.handleStkCallback(callbackData);
      return { ResultCode: 0 };
    } catch (error) {
      this.logger.error('Error processing STK callback', error);
      return { ResultCode: 1 };
    }
  }

  @Post('callback/c2b')
  @HttpCode(HttpStatus.OK)
  async c2bCallback(@Body() callbackData: C2BCallbackDto): Promise<{ ResultCode: number }> {
    this.logger.log('C2B callback received');
    
    try {
      await this.mpesaService.handleC2BCallback(callbackData);
      return { ResultCode: 0 };
    } catch (error) {
      this.logger.error('Error processing C2B callback', error);
      return { ResultCode: 1 };
    }
  }

  // ==================== RECONCILIATION ====================

  @Post('reconcile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'OWNER')
  @HttpCode(HttpStatus.OK)
  async reconcile(
    @Request() req,
    @Body() reconcileDto: ReconcileDto,
  ): Promise<ReconciliationResultDto> {
    return this.mpesaService.reconcile(reconcileDto, req.user.userId);
  }

  // ==================== QUERY TRANSACTIONS ====================

  @Get('transactions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  async getTransactions(
    @Query() queryDto: MpesaTransactionQueryDto,
  ): Promise<MpesaTransactionResponseDto[]> {
    return this.mpesaService.getTransactions(queryDto);
  }

  // ==================== HEALTH CHECK ====================

  @Get('health')
  @HttpCode(HttpStatus.OK)
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
