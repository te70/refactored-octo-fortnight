import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  Header,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { AuditService } from './audit.service';
import {
  AuditQueryDto,
  AuditResponseDto,
  AuditStatsDto,
  ExportAuditDto,
} from './dto/audit.dto';

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  // ==================== GET AUDIT LOGS ====================

  @Get()
  @Roles('MANAGER', 'OWNER')
  async getAuditLogs(@Query() queryDto: AuditQueryDto): Promise<AuditResponseDto[]> {
    return this.auditService.getAuditLogs(queryDto);
  }

  @Get('stats')
  @Roles('MANAGER', 'OWNER')
  async getAuditStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<AuditStatsDto> {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.auditService.getAuditStats(start, end);
  }

  @Get('export/csv')
  @Roles('MANAGER', 'OWNER')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="audit-logs.csv"')
  async exportToCsv(@Query() exportDto: ExportAuditDto): Promise<string> {
    return this.auditService.exportToCsv(exportDto);
  }

  @Get('user/:userId')
  @Roles('MANAGER', 'OWNER')
  async getUserActivity(
    @Param('userId') userId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<AuditResponseDto[]> {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.auditService.getUserActivity(userId, start, end);
  }

  @Get('table/:tableName')
  @Roles('MANAGER', 'OWNER')
  async getTableActivity(
    @Param('tableName') tableName: string,
    @Query('recordId') recordId?: string,
  ): Promise<AuditResponseDto[]> {
    return this.auditService.getTableActivity(tableName, recordId);
  }

  @Get(':id')
  @Roles('MANAGER', 'OWNER')
  async getAuditLogById(@Param('id') id: string): Promise<AuditResponseDto> {
    return this.auditService.getAuditLogById(id);
  }
}