import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateRoomDto,
  UpdateRoomDto,
  RoomResponseDto,
  CheckInDto,
  CheckOutDto,
  ReservationResponseDto,
  RoomFolioDto,
  OccupancyReportDto,
  SearchRoomsDto,
  AvailableRoomDto,
  CreateReservationDto,
  UpdateReservationDto,
  RecordPaymentDto,
} from './dto/hotel-rooms.dto';

@Injectable()
export class HotelRoomsService {
  constructor(private prisma: PrismaService) {}

  // ==================== ROOMS MANAGEMENT ====================

  async createRoom(createRoomDto: CreateRoomDto, userId: string): Promise<RoomResponseDto> {
    const existing = await this.prisma.room.findUnique({
      where: { roomNumber: createRoomDto.roomNumber },
    });

    if (existing) {
      throw new ConflictException(`Room ${createRoomDto.roomNumber} already exists`);
    }

    const room = await this.prisma.room.create({
      data: createRoomDto,
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'CREATE',
        tableName: 'rooms',
        recordId: room.id,
        afterJson: {
          roomNumber: room.roomNumber,
          type: room.type,
          rateStandard: room.rateStandard.toString(),
        },
      },
    });

    return this.formatRoomResponse(room);
  }

  async getAllRooms(): Promise<RoomResponseDto[]> {
    const rooms = await this.prisma.room.findMany({
      include: {
        reservations: {
          where: {
            status: 'CHECKED_IN',
          },
          select: {
            id: true,
            guestName: true,
            checkIn: true,
            checkOut: true,
          },
        },
      },
      orderBy: {
        roomNumber: 'asc',
      },
    });

    return rooms.map((room) => ({
      ...this.formatRoomResponse(room),
      ...(room.reservations.length > 0 && {
        currentReservation: room.reservations[0],
      }),
    }));
  }

  async getRoomById(id: string): Promise<RoomResponseDto> {
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: {
        reservations: {
          where: {
            status: 'CHECKED_IN',
          },
          select: {
            id: true,
            guestName: true,
            checkIn: true,
            checkOut: true,
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    return {
      ...this.formatRoomResponse(room),
      ...(room.reservations.length > 0 && {
        currentReservation: room.reservations[0],
      }),
    };
  }

  async updateRoom(
    id: string,
    updateRoomDto: UpdateRoomDto,
    userId: string,
  ): Promise<RoomResponseDto> {
    const existing = await this.prisma.room.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Room not found');
    }

    const updated = await this.prisma.room.update({
      where: { id },
      data: updateRoomDto,
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'UPDATE',
        tableName: 'rooms',
        recordId: id,
        beforeJson: {
          status: existing.status,
          rateStandard: existing.rateStandard.toString(),
        },
        afterJson: {
          status: updated.status,
          rateStandard: updated.rateStandard.toString(),
        },
      },
    });

    return this.formatRoomResponse(updated);
  }

  // ==================== CHECK-IN ====================

  async checkIn(checkInDto: CheckInDto, userId: string): Promise<ReservationResponseDto> {
    const room = await this.prisma.room.findUnique({
      where: { id: checkInDto.roomId },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    if (room.status !== 'VACANT') {
      throw new BadRequestException(`Room ${room.roomNumber} is not vacant (status: ${room.status})`);
    }

    // Check for overlapping reservations
    const checkInDate = new Date(checkInDto.checkIn);
    const checkOutDate = new Date(checkInDto.checkOut);

    if (checkOutDate <= checkInDate) {
      throw new BadRequestException('Check-out date must be after check-in date');
    }

    const overlapping = await this.prisma.reservation.findFirst({
      where: {
        roomId: checkInDto.roomId,
        status: { in: ['CHECKED_IN', 'RESERVED'] },
        OR: [
          {
            AND: [
              { checkIn: { lte: checkOutDate } },
              { checkOut: { gte: checkInDate } },
            ],
          },
        ],
      },
    });

    if (overlapping) {
      throw new BadRequestException(
        `Room has overlapping reservation from ${overlapping.checkIn.toISOString()} to ${overlapping.checkOut.toISOString()}`,
      );
    }

    // Calculate nights and total
    const nights = Math.ceil(
      (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (nights <= 0) {
      throw new BadRequestException('Invalid date range - must be at least 1 night');
    }

    const totalAmount = checkInDto.rateApplied * nights;
    const amountPaid = checkInDto.advancePayment || 0;

    const reservation = await this.prisma.$transaction(async (prisma) => {
      // Create reservation
      const res = await prisma.reservation.create({
        data: {
          roomId: checkInDto.roomId,
          guestName: checkInDto.guestName,
          idNumber: checkInDto.idNumber,
          checkIn: checkInDate,
          checkOut: checkOutDate,
          rateApplied: checkInDto.rateApplied,
          totalAmount,
          amountPaid,
          balance: totalAmount - amountPaid,
          status: 'CHECKED_IN',
        },
        include: {
          room: true,
        },
      });

      // Update room status
      await prisma.room.update({
        where: { id: checkInDto.roomId },
        data: { status: 'OCCUPIED' },
      });

      // If advance payment was made, record it
      if (amountPaid > 0 && checkInDto.paymentMethod) {
        await prisma.transaction.create({
          data: {
            division: 'HOTEL',
            type: 'ROOM_CHECKIN',
            amount: amountPaid,
            paymentMethod: checkInDto.paymentMethod,
            mpesaRef: checkInDto.mpesaRef,
            userId,
            shiftId: (await this.getActiveShift(userId)) || '',
            reservationId: res.id,
          },
        });

        // Create Mpesa transaction record if applicable
        if (checkInDto.paymentMethod === 'MPESA' && checkInDto.mpesaRef) {
          await prisma.mpesaTransaction.create({
            data: {
              transactionRef: checkInDto.mpesaRef,
              amount: amountPaid,
              msisdn: 'UNKNOWN',
              division: 'HOTEL',
              timestamp: new Date(),
              status: 'PENDING',
            },
          });
        }
      }

      return res;
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'CHECK_IN',
        tableName: 'reservations',
        recordId: reservation.id,
        afterJson: {
          guestName: reservation.guestName,
          roomNumber: room.roomNumber,
          nights: nights.toString(),
          totalAmount: totalAmount.toString(),
          amountPaid: amountPaid.toString(),
        },
      },
    });

    return this.formatReservationResponse(reservation);
  }

  // ==================== CHECK-OUT ====================

  async checkOut(
    reservationId: string,
    checkOutDto: CheckOutDto,
    userId: string,
  ): Promise<{ reservation: ReservationResponseDto; folio: RoomFolioDto }> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        room: true,
        transactions: true,
      },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    if (reservation.status !== 'CHECKED_IN') {
      throw new BadRequestException(`Cannot check out - reservation status is ${reservation.status}`);
    }

    const additionalCharges = checkOutDto.additionalCharges || 0;
    const finalPayment = checkOutDto.finalPayment || 0;
    const newTotalAmount = Number(reservation.totalAmount) + additionalCharges;
    const newAmountPaid = Number(reservation.amountPaid) + finalPayment;
    const newBalance = newTotalAmount - newAmountPaid;

    const updated = await this.prisma.$transaction(async (prisma) => {
      // Update reservation
      const res = await prisma.reservation.update({
        where: { id: reservationId },
        data: {
          status: 'CHECKED_OUT',
          totalAmount: newTotalAmount,
          amountPaid: newAmountPaid,
          balance: newBalance,
        },
        include: {
          room: true,
          transactions: true,
        },
      });

      // Update room status
      await prisma.room.update({
        where: { id: reservation.roomId },
        data: { status: 'VACANT' },
      });

      // Record final payment if any
      if (finalPayment > 0 && checkOutDto.paymentMethod) {
        await prisma.transaction.create({
          data: {
            division: 'HOTEL',
            type: 'ROOM_CHECKOUT',
            amount: finalPayment,
            paymentMethod: checkOutDto.paymentMethod,
            mpesaRef: checkOutDto.mpesaRef,
            userId,
            shiftId: (await this.getActiveShift(userId)) || '',
            reservationId: res.id,
          },
        });

        // Create Mpesa transaction record if applicable
        if (checkOutDto.paymentMethod === 'MPESA' && checkOutDto.mpesaRef) {
          await prisma.mpesaTransaction.create({
            data: {
              transactionRef: checkOutDto.mpesaRef,
              amount: finalPayment,
              msisdn: 'UNKNOWN',
              division: 'HOTEL',
              timestamp: new Date(),
              status: 'PENDING',
            },
          });
        }
      }

      return res;
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'CHECK_OUT',
        tableName: 'reservations',
        recordId: reservationId,
        afterJson: {
          guestName: reservation.guestName,
          roomNumber: reservation.room.roomNumber,
          finalBalance: newBalance.toString(),
          additionalCharges: additionalCharges.toString(),
        },
      },
    });

    // Create alert if there's an outstanding balance
    if (newBalance > 0) {
      await this.prisma.alert.create({
        data: {
          type: 'OUTSTANDING_BALANCE',
          severity: newBalance > 5000 ? 'WARNING' : 'INFO',
          division: 'HOTEL',
          description: `Guest ${reservation.guestName} checked out with outstanding balance of KES ${newBalance.toFixed(2)} (Room ${reservation.room.roomNumber})`,
        },
      });
    }

    // Generate folio
    const folio = await this.generateFolio(reservationId);

    return {
      reservation: this.formatReservationResponse(updated),
      folio,
    };
  }

  // ==================== FOLIO GENERATION ====================

  async generateFolio(reservationId: string): Promise<RoomFolioDto> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        room: true,
        transactions: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    const nights = Math.ceil(
      (new Date(reservation.checkOut).getTime() - new Date(reservation.checkIn).getTime()) /
        (1000 * 60 * 60 * 24),
    );

    const roomCharges = Number(reservation.rateApplied) * nights;
    const additionalCharges = Number(reservation.totalAmount) - roomCharges;

    return {
      reservationId: reservation.id,
      guestName: reservation.guestName,
      idNumber: reservation.idNumber,
      roomNumber: reservation.room.roomNumber,
      roomType: reservation.room.type,
      checkIn: reservation.checkIn,
      checkOut: reservation.checkOut,
      nights,
      ratePerNight: Number(reservation.rateApplied),
      roomCharges,
      additionalCharges,
      totalCharges: Number(reservation.totalAmount),
      payments: reservation.transactions.map((t) => ({
        date: t.createdAt,
        description: t.type,
        amount: Number(t.amount),
        paymentMethod: t.paymentMethod,
        reference: t.mpesaRef || undefined,
      })),
      amountPaid: Number(reservation.amountPaid),
      balance: Number(reservation.balance),
    };
  }

  // ==================== OCCUPANCY REPORTS ====================

  async getOccupancyReport(date: Date): Promise<OccupancyReportDto> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const totalRooms = await this.prisma.room.count();
    
    const roomsByStatus = await this.prisma.room.groupBy({
      by: ['status'],
      _count: true,
    });

    const statusCounts = {
      OCCUPIED: 0,
      VACANT: 0,
      MAINTENANCE: 0,
      RESERVED: 0,
    };

    roomsByStatus.forEach((group) => {
      statusCounts[group.status] = group._count;
    });

    const reservations = await this.prisma.reservation.findMany({
      where: {
        checkIn: { lte: endOfDay },
        checkOut: { gte: startOfDay },
        status: { in: ['CHECKED_IN', 'RESERVED'] },
      },
      include: {
        room: true,
      },
    });

    const totalRevenue = reservations
      .filter((r) => r.status === 'CHECKED_IN')
      .reduce((sum, res) => sum + Number(res.rateApplied), 0);

    const occupiedRooms = statusCounts.OCCUPIED;
    const adr = occupiedRooms > 0 ? totalRevenue / occupiedRooms : 0;
    const revpar = totalRooms > 0 ? totalRevenue / totalRooms : 0;
    const occupancyRate = totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0;

    return {
      date,
      totalRooms,
      occupiedRooms: statusCounts.OCCUPIED,
      vacantRooms: statusCounts.VACANT,
      maintenanceRooms: statusCounts.MAINTENANCE,
      reservedRooms: statusCounts.RESERVED,
      occupancyRate: Number(occupancyRate.toFixed(2)),
      adr: Number(adr.toFixed(2)),
      revpar: Number(revpar.toFixed(2)),
      totalRevenue: Number(totalRevenue.toFixed(2)),
      reservations: reservations.map((r) => ({
        guestName: r.guestName,
        roomNumber: r.room.roomNumber,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        rate: Number(r.rateApplied),
        status: r.status,
      })),
    };
  }

  // ==================== ROOM AVAILABILITY ====================

  async searchAvailableRooms(searchDto: SearchRoomsDto): Promise<AvailableRoomDto[]> {
    const checkInDate = searchDto.checkIn ? new Date(searchDto.checkIn) : new Date();
    const checkOutDate = searchDto.checkOut ? new Date(searchDto.checkOut) : new Date();

    const rooms = await this.prisma.room.findMany({
      where: {
        ...(searchDto.roomType && { type: searchDto.roomType }),
        ...(searchDto.status && { status: searchDto.status }),
        ...(searchDto.maxRate && {
          rateStandard: { lte: searchDto.maxRate },
        }),
      },
      include: {
        reservations: {
          where: {
            status: { in: ['CHECKED_IN', 'RESERVED'] },
          },
          orderBy: {
            checkIn: 'asc',
          },
        },
      },
    });

    return rooms.map((room) => {
      // Check if room has any conflicting reservations
      const hasConflict = room.reservations.some((res) => {
        return (
          new Date(res.checkIn) < checkOutDate &&
          new Date(res.checkOut) > checkInDate
        );
      });

      const nextReservation = room.reservations[0];

      return {
        id: room.id,
        roomNumber: room.roomNumber,
        type: room.type,
        rateStandard: Number(room.rateStandard),
        rateWeekend: Number(room.rateWeekend),
        rateEvent: Number(room.rateEvent),
        status: room.status,
        isAvailable: !hasConflict && room.status === 'VACANT',
        ...(nextReservation && {
          nextReservation: {
            checkIn: nextReservation.checkIn,
            checkOut: nextReservation.checkOut,
            guestName: nextReservation.guestName,
          },
        }),
      };
    });
  }

  // ==================== RESERVATIONS MANAGEMENT ====================

  async createReservation(
    createReservationDto: CreateReservationDto,
    userId: string,
  ): Promise<ReservationResponseDto> {
    const room = await this.prisma.room.findUnique({
      where: { id: createReservationDto.roomId },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const checkInDate = new Date(createReservationDto.checkIn);
    const checkOutDate = new Date(createReservationDto.checkOut);

    // Check for overlapping reservations
    const overlapping = await this.prisma.reservation.findFirst({
      where: {
        roomId: createReservationDto.roomId,
        status: { in: ['CHECKED_IN', 'RESERVED'] },
        OR: [
          {
            AND: [
              { checkIn: { lte: checkOutDate } },
              { checkOut: { gte: checkInDate } },
            ],
          },
        ],
      },
    });

    if (overlapping) {
      throw new BadRequestException('Room has overlapping reservation');
    }

    const nights = Math.ceil(
      (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    const totalAmount = createReservationDto.rateApplied * nights;
    const deposit = createReservationDto.deposit || 0;

    const reservation = await this.prisma.reservation.create({
      data: {
        roomId: createReservationDto.roomId,
        guestName: createReservationDto.guestName,
        idNumber: createReservationDto.idNumber,
        checkIn: checkInDate,
        checkOut: checkOutDate,
        rateApplied: createReservationDto.rateApplied,
        totalAmount,
        amountPaid: deposit,
        balance: totalAmount - deposit,
        status: 'RESERVED',
      },
      include: {
        room: true,
      },
    });

    // Update room status to RESERVED
    await this.prisma.room.update({
      where: { id: createReservationDto.roomId },
      data: { status: 'RESERVED' },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'CREATE',
        tableName: 'reservations',
        recordId: reservation.id,
        afterJson: {
          guestName: reservation.guestName,
          roomNumber: room.roomNumber,
          status: 'RESERVED',
        },
      },
    });

    return this.formatReservationResponse(reservation);
  }

  async updateReservation(
    id: string,
    updateReservationDto: UpdateReservationDto,
    userId: string,
  ): Promise<ReservationResponseDto> {
    const existing = await this.prisma.reservation.findUnique({
      where: { id },
      include: { room: true },
    });

    if (!existing) {
      throw new NotFoundException('Reservation not found');
    }

    const updated = await this.prisma.reservation.update({
      where: { id },
      data: updateReservationDto,
      include: { room: true },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'UPDATE',
        tableName: 'reservations',
        recordId: id,
        beforeJson: {
          status: existing.status,
          rateApplied: existing.rateApplied.toString(),
        },
        afterJson: {
          status: updated.status,
          rateApplied: updated.rateApplied.toString(),
        },
      },
    });

    return this.formatReservationResponse(updated);
  }

  async cancelReservation(id: string, userId: string): Promise<ReservationResponseDto> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: { room: true },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    if (reservation.status === 'CHECKED_OUT') {
      throw new BadRequestException('Cannot cancel a checked-out reservation');
    }

    const cancelled = await this.prisma.$transaction(async (prisma) => {
      const res = await prisma.reservation.update({
        where: { id },
        data: { status: 'NO_SHOW' },
        include: { room: true },
      });

      // Set room back to VACANT if it was RESERVED
      if (reservation.room.status === 'RESERVED') {
        await prisma.room.update({
          where: { id: reservation.roomId },
          data: { status: 'VACANT' },
        });
      }

      return res;
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'CANCEL',
        tableName: 'reservations',
        recordId: id,
        beforeJson: { status: reservation.status },
        afterJson: { status: 'NO_SHOW' },
      },
    });

    return this.formatReservationResponse(cancelled);
  }

  // ==================== HELPER METHODS ====================

  private async getActiveShift(userId: string): Promise<string | null> {
    const shift = await this.prisma.shift.findFirst({
      where: {
        userId,
        closedAt: null,
      },
    });

    return shift?.id || null;
  }

  private formatRoomResponse(room: any): RoomResponseDto {
    return {
      id: room.id,
      roomNumber: room.roomNumber,
      type: room.type,
      rateStandard: Number(room.rateStandard),
      rateWeekend: Number(room.rateWeekend),
      rateEvent: Number(room.rateEvent),
      status: room.status,
    };
  }

  private formatReservationResponse(reservation: any): ReservationResponseDto {
    return {
      id: reservation.id,
      room: {
        id: reservation.room.id,
        roomNumber: reservation.room.roomNumber,
        type: reservation.room.type,
      },
      guestName: reservation.guestName,
      idNumber: reservation.idNumber,
      checkIn: reservation.checkIn,
      checkOut: reservation.checkOut,
      rateApplied: Number(reservation.rateApplied),
      totalAmount: Number(reservation.totalAmount),
      amountPaid: Number(reservation.amountPaid),
      balance: Number(reservation.balance),
      status: reservation.status,
      createdAt: reservation.createdAt,
    };
  }
}
