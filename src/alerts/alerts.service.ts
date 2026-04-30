import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAlertDto,
  UpdateAlertDto,
  InvestigateAlertDto,
  ResolveAlertDto,
  AlertResponseDto,
  AlertQueryDto,
  AlertStatsDto,
  AlertType,
  AlertSeverity,
  AlertStatus,
} from './dto/alerts.dto';
import { Division } from '@prisma/client';

@Injectable()
export class AlertsService {
  constructor(private prisma: PrismaService) {}

  // ==================== CREATE ALERT ====================

  async createAlert(createAlertDto: CreateAlertDto): Promise<AlertResponseDto> {
     if (!createAlertDto.division) {
      throw new Error('Division is required');
    }
    const alert = await this.prisma.alert.create({
      data: {
        type: createAlertDto.type,
        severity: createAlertDto.severity,
        status: 'OPEN',
        description: createAlertDto.description,
        division: createAlertDto.division,
      },
    });

    return this.formatAlertResponse(alert);
  }

  // ==================== GET ALERTS ====================

  async getAllAlerts(queryDto: AlertQueryDto): Promise<AlertResponseDto[]> {
    const startDate = queryDto.startDate ? new Date(queryDto.startDate) : undefined;
    const endDate = queryDto.endDate ? new Date(queryDto.endDate) : undefined;
    
    if (endDate) {
      endDate.setHours(23, 59, 59, 999);
    }

    const alerts = await this.prisma.alert.findMany({
      where: {
        ...(queryDto.type && { type: queryDto.type }),
        ...(queryDto.severity && { severity: queryDto.severity }),
        ...(queryDto.status && { status: queryDto.status }),
        ...(queryDto.division && { division: queryDto.division }),
        ...(startDate && endDate && {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        }),
      },
      orderBy: [
        { status: 'asc' }, // OPEN first
        { severity: 'desc' }, // CRITICAL first
      ],
      take: 100,
    });

    return alerts.map((alert) => this.formatAlertResponse(alert));
  }

  async getAlertById(id: string): Promise<AlertResponseDto> {
    const alert = await this.prisma.alert.findUnique({
      where: { id },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    return this.formatAlertResponse(alert);
  }

  // ==================== UPDATE ALERT ====================

  async updateAlert(
    id: string,
    updateAlertDto: UpdateAlertDto,
    userId: string,
  ): Promise<AlertResponseDto> {
    const alert = await this.prisma.alert.findUnique({
      where: { id },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    const updated = await this.prisma.alert.update({
      where: { id },
      data: {
        ...(updateAlertDto.status && { status: updateAlertDto.status }),
        ...(updateAlertDto.notes && { notes: updateAlertDto.notes }),
      },
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'UPDATE',
        tableName: 'alerts',
        recordId: id,
        beforeJson: {
          status: alert.status,
        },
        afterJson: {
          status: updated.status,
        },
      },
    });

    return this.formatAlertResponse(updated);
  }

  // ==================== INVESTIGATE ALERT ====================

  async investigateAlert(
    id: string,
    investigateAlertDto: InvestigateAlertDto,
    userId: string,
  ): Promise<AlertResponseDto> {
    const alert = await this.prisma.alert.findUnique({
      where: { id },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    if (alert.status === 'RESOLVED') {
      throw new BadRequestException('Cannot investigate a resolved alert');
    }

    const updated = await this.prisma.alert.update({
      where: { id },
      data: {
        status: 'INVESTIGATING',
      },
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'INVESTIGATE_ALERT',
        tableName: 'alerts',
        recordId: id,
        afterJson: {
          status: 'INVESTIGATING',
          notes: investigateAlertDto.notes,
        },
      },
    });

    return this.formatAlertResponse(updated);
  }

  // ==================== RESOLVE ALERT ====================

  async resolveAlert(
    id: string,
    resolveAlertDto: ResolveAlertDto,
    userId: string,
  ): Promise<AlertResponseDto> {
    const alert = await this.prisma.alert.findUnique({
      where: { id },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    if (alert.status === 'RESOLVED') {
      throw new BadRequestException('Alert is already resolved');
    }

    const updated = await this.prisma.alert.update({
      where: { id },
      data: {
        status: 'RESOLVED',
      },
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'RESOLVE_ALERT',
        tableName: 'alerts',
        recordId: id,
        afterJson: {
          status: 'RESOLVED',
          resolution: resolveAlertDto.resolution,
        },
      },
    });

    return this.formatAlertResponse(updated);
  }

  // ==================== DISMISS ALERT ====================

  async dismissAlert(id: string, userId: string): Promise<AlertResponseDto> {
    const alert = await this.prisma.alert.findUnique({
      where: { id },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    const updated = await this.prisma.alert.update({
      where: { id },
      data: {
        status: 'DISMISSED',
      },
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'DISMISS_ALERT',
        tableName: 'alerts',
        recordId: id,
        afterJson: {
          status: 'DISMISSED',
        },
      },
    });

    return this.formatAlertResponse(updated);
  }

  // ==================== ALERT STATISTICS ====================

  async getAlertStats(division?: Division): Promise<AlertStatsDto> {
    const alerts = await this.prisma.alert.findMany({
      where: {
        ...(division && { division }),
      },
    });

    const total = alerts.length;
    const open = alerts.filter((a) => a.status === 'OPEN').length;
    const investigating = alerts.filter((a) => a.status === 'INVESTIGATING').length;
    const resolved = alerts.filter((a) => a.status === 'RESOLVED').length;
    const dismissed = alerts.filter((a) => a.status === 'DISMISSED').length;

    // By type
    const byType = {
      [AlertType.STOCK_VARIANCE]: 0,
      [AlertType.CASH_VARIANCE]: 0,
      [AlertType.MPESA_DISCREPANCY]: 0,
      [AlertType.LOW_STOCK]: 0,
      [AlertType.PENDING_APPROVAL]: 0,
      [AlertType.SYSTEM]: 0,
    };

    alerts.forEach((alert) => {
      byType[alert.type as AlertType]++;
    });

    // By severity
    const bySeverity = {
      [AlertSeverity.INFO]: 0,
      [AlertSeverity.WARNING]: 0,
      [AlertSeverity.CRITICAL]: 0,
    };

    alerts.forEach((alert) => {
      bySeverity[alert.severity as AlertSeverity]++;
    });

    // By division
    const byDivision: Record<string, number> = {};
    alerts.forEach((alert) => {
      if (alert.division) {
        byDivision[alert.division] = (byDivision[alert.division] || 0) + 1;
      }
    });

    // Average resolution time
    const resolvedAlerts = alerts.filter(
      (a) => a.status === 'RESOLVED' && a.resolvedAt,
    );

    let totalResolutionTime = 0;
    resolvedAlerts.forEach((alert) => {
      const raisedAt = new Date(alert.raisedAt).getTime();
      const resolvedAt = new Date(alert.resolvedAt!).getTime();
      const diffInHours = (resolvedAt - raisedAt) / (1000 * 60 * 60);
      totalResolutionTime += diffInHours;
    });

    const averageResolutionTime =
      resolvedAlerts.length > 0 ? totalResolutionTime / resolvedAlerts.length : 0;

    // Oldest open alert
    const openAlerts = alerts.filter((a) => a.status === 'OPEN');
    let oldestOpenAlert: {
      id: string;
      description: string;
      raisedAt: Date;
      ageInHours: number;
    } | undefined = undefined;

    if (openAlerts.length > 0) {
      const oldest = openAlerts.sort(
        (a, b) => new Date(a.raisedAt).getTime() - new Date(b.raisedAt).getTime(),
      )[0];

      const ageInHours =
        (Date.now() - new Date(oldest.raisedAt).getTime()) / (1000 * 60 * 60);

      oldestOpenAlert = {
        id: oldest.id,
        description: oldest.description,
        raisedAt: oldest.raisedAt,
        ageInHours: Number(ageInHours.toFixed(2)),
      };
    }

    return {
      total,
      open,
      investigating,
      resolved,
      dismissed,
      byType,
      bySeverity,
      byDivision,
      averageResolutionTime: Number(averageResolutionTime.toFixed(2)),
      oldestOpenAlert,
    };
  }

  // ==================== AUTO-GENERATE ALERTS ====================

  async generateLowStockAlerts(): Promise<number> {
    const stockItems = await this.prisma.stockItem.findMany({
      include: {
        movements: true,
      },
    });

    let alertCount = 0;

    for (const item of stockItems) {
      const currentStock = item.movements.reduce(
        (sum, movement) => sum + Number(movement.quantity),
        0,
      );

      if (currentStock <= Number(item.reorderLevel)) {
        const description = `Low Stock: ${item.name} - Current stock (${currentStock.toFixed(2)} ${item.unit}) is at or below reorder level (${Number(item.reorderLevel)} ${item.unit}).`;
        
        // Check if alert already exists for this stock item
        const existing = await this.prisma.alert.findFirst({
          where: {
            type: AlertType.LOW_STOCK,
            description,
            status: {
              in: ['OPEN', 'INVESTIGATING'],
            },
          },
        });

        if (!existing) {
          await this.createAlert({
            type: AlertType.LOW_STOCK,
            severity: currentStock === 0 ? AlertSeverity.CRITICAL : AlertSeverity.WARNING,
            description,
            division: item.division,
          });

          alertCount++;
        }
      }
    }

    return alertCount;
  }

  // ==================== HELPER METHODS ====================

  private formatAlertResponse(alert: any): AlertResponseDto {
    return {
      id: alert.id,
      type: alert.type as AlertType,
      severity: alert.severity as AlertSeverity,
      status: alert.status as AlertStatus,
      description: alert.description,
      division: alert.division,
      raisedAt: alert.raisedAt,
    };
  }
}