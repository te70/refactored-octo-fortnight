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
import { AlertsService } from './alerts.service';
import {
  CreateAlertDto,
  UpdateAlertDto,
  InvestigateAlertDto,
  ResolveAlertDto,
  AlertResponseDto,
  AlertQueryDto,
  AlertStatsDto,
} from './dto/alerts.dto';
import { Division } from '@prisma/client';

@Controller('alerts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  // ==================== CREATE & GET ALERTS ====================

  @Post()
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @HttpCode(HttpStatus.CREATED)
  async createAlert(@Body() createAlertDto: CreateAlertDto): Promise<AlertResponseDto> {
    return this.alertsService.createAlert(createAlertDto);
  }

  @Get()
  async getAllAlerts(@Query() queryDto: AlertQueryDto): Promise<AlertResponseDto[]> {
    return this.alertsService.getAllAlerts(queryDto);
  }

  @Get('stats')
  @Roles('MANAGER', 'OWNER')
  async getAlertStats(@Query('division') division?: Division): Promise<AlertStatsDto> {
    return this.alertsService.getAlertStats(division);
  }

  @Get(':id')
  async getAlertById(@Param('id') id: string): Promise<AlertResponseDto> {
    return this.alertsService.getAlertById(id);
  }

  // ==================== UPDATE ALERTS ====================

  @Put(':id')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  async updateAlert(
    @Request() req,
    @Param('id') id: string,
    @Body() updateAlertDto: UpdateAlertDto,
  ): Promise<AlertResponseDto> {
    return this.alertsService.updateAlert(id, updateAlertDto, req.user.userId);
  }

  // ==================== INVESTIGATE ALERT ====================

  @Post(':id/investigate')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  async investigateAlert(
    @Request() req,
    @Param('id') id: string,
    @Body() investigateAlertDto: InvestigateAlertDto,
  ): Promise<AlertResponseDto> {
    return this.alertsService.investigateAlert(id, investigateAlertDto, req.user.userId);
  }

  // ==================== RESOLVE ALERT ====================

  @Post(':id/resolve')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  async resolveAlert(
    @Request() req,
    @Param('id') id: string,
    @Body() resolveAlertDto: ResolveAlertDto,
  ): Promise<AlertResponseDto> {
    return this.alertsService.resolveAlert(id, resolveAlertDto, req.user.userId);
  }

  // ==================== DISMISS ALERT ====================

  @Post(':id/dismiss')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  async dismissAlert(@Request() req, @Param('id') id: string): Promise<AlertResponseDto> {
    return this.alertsService.dismissAlert(id, req.user.userId);
  }

  // ==================== AUTO-GENERATE ALERTS ====================

  @Post('generate/low-stock')
  @Roles('MANAGER', 'OWNER')
  @HttpCode(HttpStatus.OK)
  async generateLowStockAlerts(): Promise<{ count: number }> {
    const count = await this.alertsService.generateLowStockAlerts();
    return { count };
  }
}