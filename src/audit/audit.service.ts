import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuditQueryDto,
  AuditResponseDto,
  AuditStatsDto,
  ExportAuditDto,
} from './dto/audit.dto';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  // ==================== GET AUDIT LOGS ====================

  async getAuditLogs(queryDto: AuditQueryDto): Promise<AuditResponseDto[]> {
    const startDate = queryDto.startDate ? new Date(queryDto.startDate) : undefined;
    const endDate = queryDto.endDate ? new Date(queryDto.endDate) : undefined;

    if (endDate) {
      endDate.setHours(23, 59, 59, 999);
    }

    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        ...(queryDto.userId && { userId: queryDto.userId }),
        ...(queryDto.action && { action: queryDto.action }),
        ...(queryDto.tableName && { tableName: queryDto.tableName }),
        ...(queryDto.recordId && { recordId: queryDto.recordId }),
        ...(startDate &&
          endDate && {
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          }),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 100,
    });

    return auditLogs.map((log) => this.formatAuditResponse(log));
  }

  async getAuditLogById(id: string): Promise<AuditResponseDto> {
    const auditLog = await this.prisma.auditLog.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!auditLog) {
      throw new NotFoundException('Audit log not found');
    }

    return this.formatAuditResponse(auditLog);
  }

  // ==================== AUDIT STATISTICS ====================

  async getAuditStats(
    startDate?: Date,
    endDate?: Date,
  ): Promise<AuditStatsDto> {
    if (endDate) {
      endDate.setHours(23, 59, 59, 999);
    }

    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        ...(startDate &&
          endDate && {
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          }),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const totalLogs = auditLogs.length;

    // By action
    const byAction: Record<string, number> = {};
    auditLogs.forEach((log) => {
      byAction[log.action] = (byAction[log.action] || 0) + 1;
    });

    // By table
    const byTable: Record<string, number> = {};
    auditLogs.forEach((log) => {
      byTable[log.tableName] = (byTable[log.tableName] || 0) + 1;
    });

    // By user
    const userActionMap = new Map<
      string,
      { userId: string; userName: string; count: number }
    >();

    auditLogs.forEach((log) => {
      const existing = userActionMap.get(log.userId);
      if (existing) {
        existing.count++;
      } else {
        userActionMap.set(log.userId, {
          userId: log.user.id,
          userName: log.user.name,
          count: 1,
        });
      }
    });

    const byUser = Array.from(userActionMap.values())
      .map((user) => ({
        userId: user.userId,
        userName: user.userName,
        actionCount: user.count,
      }))
      .sort((a, b) => b.actionCount - a.actionCount)
      .slice(0, 10);

    // Recent activity
    const recentActivity = auditLogs
      .slice(0, 20)
      .map((log) => this.formatAuditResponse(log));

    return {
      totalLogs,
      byAction,
      byTable,
      byUser,
      recentActivity,
    };
  }

  // ==================== EXPORT TO CSV ====================

  async exportToCsv(exportDto: ExportAuditDto): Promise<string> {
    const startDate = exportDto.startDate ? new Date(exportDto.startDate) : undefined;
    const endDate = exportDto.endDate ? new Date(exportDto.endDate) : undefined;

    if (endDate) {
      endDate.setHours(23, 59, 59, 999);
    }

    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        ...(exportDto.userId && { userId: exportDto.userId }),
        ...(exportDto.action && { action: exportDto.action }),
        ...(exportDto.tableName && { tableName: exportDto.tableName }),
        ...(startDate &&
          endDate && {
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          }),
      },
      include: {
        user: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // CSV header
    const header = 'Timestamp,User,Action,Table,Record ID,Before,After\n';

    // CSV rows
    const rows = auditLogs.map((log) => {
      const timestamp = log.createdAt.toISOString();
      const user = log.user.name;
      const action = log.action;
      const table = log.tableName;
      const recordId = log.recordId;
      const before = log.beforeJson
        ? JSON.stringify(log.beforeJson).replace(/"/g, '""')
        : '';
      const after = log.afterJson
        ? JSON.stringify(log.afterJson).replace(/"/g, '""')
        : '';

      return `"${timestamp}","${user}","${action}","${table}","${recordId}","${before}","${after}"`;
    });

    return header + rows.join('\n');
  }

  // ==================== USER ACTIVITY TRACKING ====================

  async getUserActivity(
    userId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<AuditResponseDto[]> {
    if (endDate) {
      endDate.setHours(23, 59, 59, 999);
    }

    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        userId,
        ...(startDate &&
          endDate && {
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          }),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 100,
    });

    return auditLogs.map((log) => this.formatAuditResponse(log));
  }

  // ==================== TABLE ACTIVITY TRACKING ====================

  async getTableActivity(
    tableName: string,
    recordId?: string,
  ): Promise<AuditResponseDto[]> {
    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        tableName,
        ...(recordId && { recordId }),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    });

    return auditLogs.map((log) => this.formatAuditResponse(log));
  }

  // ==================== HELPER METHODS ====================

  private formatAuditResponse(log: any): AuditResponseDto {
    // Type-safe JSON handling
    let beforeJson: Record<string, any> | undefined = undefined;
    let afterJson: Record<string, any> | undefined = undefined;

    // Handle beforeJson - could be null, Json, or object
    if (log.beforeJson) {
      if (typeof log.beforeJson === 'string') {
        try {
          beforeJson = JSON.parse(log.beforeJson);
        } catch {
          beforeJson = { raw: log.beforeJson };
        }
      } else if (typeof log.beforeJson === 'object') {
        beforeJson = log.beforeJson as Record<string, any>;
      }
    }

    // Handle afterJson - could be null, Json, or object
    if (log.afterJson) {
      if (typeof log.afterJson === 'string') {
        try {
          afterJson = JSON.parse(log.afterJson);
        } catch {
          afterJson = { raw: log.afterJson };
        }
      } else if (typeof log.afterJson === 'object') {
        afterJson = log.afterJson as Record<string, any>;
      }
    }

    return {
      id: log.id,
      userId: log.userId,
      userName: log.user.name,
      action: log.action,
      tableName: log.tableName,
      recordId: log.recordId,
      beforeJson,
      afterJson,
      createdAt: log.createdAt,
    };
  }
}