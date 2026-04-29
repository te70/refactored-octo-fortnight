import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenShiftDto, CloseShiftDto, ShiftSummaryDto } from './dto/shift.dto';
import { Division } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class ShiftsService {
  private readonly CASH_VARIANCE_THRESHOLD = 500; // KES 500 threshold

  constructor(private prisma: PrismaService) {}

  async openShift(
    userId: string,
    openShiftDto: OpenShiftDto,
  ): Promise<ShiftSummaryDto> {
    // Check if user already has an open shift
    const existingShift = await this.prisma.shift.findFirst({
      where: {
        userId,
        closedAt: null,
      },
    });

    if (existingShift) {
      throw new BadRequestException(
        'You already have an open shift. Close it before starting a new one.',
      );
    }

    // Create the shift
    const shift = await this.prisma.shift.create({
      data: {
        userId,
        division: openShiftDto.division,
        openingFloat: openShiftDto.openingFloat,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Log the action
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'SHIFT_OPEN',
        tableName: 'shifts',
        recordId: shift.id,
        afterJson: {
          division: shift.division,
          openingFloat: shift.openingFloat.toString(),
        },
      },
    });

    return this.formatShiftSummary(shift, 0, 0, 0, 0);
  }

  async closeShift(
    userId: string,
    shiftId: string,
    closeShiftDto: CloseShiftDto,
  ): Promise<ShiftSummaryDto> {
    // Get the shift
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
        transactions: {
          where: {
            isReversed: false,
          },
          select: {
            amount: true,
            paymentMethod: true,
          },
        },
      },
    });

    if (!shift) {
      throw new NotFoundException('Shift not found');
    }

    if (shift.userId !== userId) {
      throw new ForbiddenException('You can only close your own shift');
    }

    if (shift.closedAt) {
      throw new BadRequestException('This shift is already closed');
    }

    // Calculate totals
    const cashSales = shift.transactions
      .filter((t) => t.paymentMethod === 'CASH')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const mpesaSales = shift.transactions
      .filter((t) => t.paymentMethod === 'MPESA')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const expectedCash = Number(shift.openingFloat) + cashSales;
    const variance = closeShiftDto.closingCount - expectedCash;

    // Check if variance exceeds threshold
    if (Math.abs(variance) > this.CASH_VARIANCE_THRESHOLD) {
      // Manager PIN is required
      if (!closeShiftDto.managerPin) {
        throw new BadRequestException(
          `Cash variance (KES ${variance.toFixed(2)}) exceeds threshold. Manager approval required.`,
        );
      }

      // Verify manager PIN
      const managers = await this.prisma.user.findMany({
        where: {
          role: { in: ['MANAGER', 'OWNER'] },
          isActive: true,
        },
      });

      let managerApproved = false;
      for (const manager of managers) {
        if (await bcrypt.compare(closeShiftDto.managerPin, manager.pin)) {
          managerApproved = true;
          break;
        }
      }

      if (!managerApproved) {
        throw new ForbiddenException('Invalid manager PIN');
      }
    }

    // Update the shift
    const closedShift = await this.prisma.shift.update({
      where: { id: shiftId },
      data: {
        closedAt: new Date(),
        closingCount: closeShiftDto.closingCount,
        mpesaTotal: closeShiftDto.mpesaTotal || mpesaSales,
        variance,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Create alert if variance is significant
    if (Math.abs(variance) > this.CASH_VARIANCE_THRESHOLD) {
      await this.prisma.alert.create({
        data: {
          type: 'CASH_VARIANCE',
          severity: Math.abs(variance) > this.CASH_VARIANCE_THRESHOLD * 2 ? 'CRITICAL' : 'WARNING',
          division: shift.division,
          description: `Cash variance of KES ${variance.toFixed(2)} on shift close. Expected: KES ${expectedCash.toFixed(2)}, Actual: KES ${closeShiftDto.closingCount.toFixed(2)}`,
        },
      });
    }

    // Log the action
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'SHIFT_CLOSE',
        tableName: 'shifts',
        recordId: shift.id,
        beforeJson: { closedAt: null },
        afterJson: {
          closedAt: closedShift.closedAt,
          closingCount: closedShift.closingCount?.toString() || '0',
          variance: variance.toString(),
        },
      },
    });

    return this.formatShiftSummary(
      closedShift,
      cashSales + mpesaSales,
      shift.transactions.length,
      cashSales,
      mpesaSales,
    );
  }

  async getActiveShift(userId: string): Promise<ShiftSummaryDto | null> {
    const shift = await this.prisma.shift.findFirst({
      where: {
        userId,
        closedAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
        transactions: {
          where: {
            isReversed: false,
          },
          select: {
            amount: true,
            paymentMethod: true,
          },
        },
      },
    });

    if (!shift) {
      return null;
    }

    const cashSales = shift.transactions
      .filter((t) => t.paymentMethod === 'CASH')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const mpesaSales = shift.transactions
      .filter((t) => t.paymentMethod === 'MPESA')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    return this.formatShiftSummary(
      shift,
      cashSales + mpesaSales,
      shift.transactions.length,
      cashSales,
      mpesaSales,
    );
  }

  async getShiftHistory(
    userId: string,
    division?: Division,
  ): Promise<ShiftSummaryDto[]> {
    const shifts = await this.prisma.shift.findMany({
      where: {
        userId,
        ...(division && { division }),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
        transactions: {
          where: {
            isReversed: false,
          },
          select: {
            amount: true,
            paymentMethod: true,
          },
        },
      },
      orderBy: {
        openedAt: 'desc',
      },
      take: 30, // Last 30 shifts
    });

    return shifts.map((shift) => {
      const cashSales = shift.transactions
        .filter((t) => t.paymentMethod === 'CASH')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const mpesaSales = shift.transactions
        .filter((t) => t.paymentMethod === 'MPESA')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      return this.formatShiftSummary(
        shift,
        cashSales + mpesaSales,
        shift.transactions.length,
        cashSales,
        mpesaSales,
      );
    });
  }

  private formatShiftSummary(
    shift: any,
    totalSales: number,
    totalTransactions: number,
    cashSales: number,
    mpesaSales: number,
  ): ShiftSummaryDto {
    return {
      id: shift.id,
      division: shift.division,
      user: shift.user,
      openedAt: shift.openedAt,
      closedAt: shift.closedAt,
      openingFloat: Number(shift.openingFloat),
      closingCount: shift.closingCount ? Number(shift.closingCount) : null,
      mpesaTotal: shift.mpesaTotal ? Number(shift.mpesaTotal) : null,
      variance: shift.variance ? Number(shift.variance) : null,
      totalSales,
      totalTransactions,
      cashSales,
      mpesaSales,
    };
  }
}
