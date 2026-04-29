import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsDateString,
  IsUUID,
  Min,
  IsBoolean,
} from 'class-validator';
import { RoomStatus, PaymentMethod } from '@prisma/client';

// ==================== ROOM DTOs ====================

export class CreateRoomDto {
  @IsString()
  roomNumber: string;

  @IsString()
  type: string; // Single, Double, Suite, Deluxe, etc.

  @IsNumber()
  @Min(0)
  rateStandard: number;

  @IsNumber()
  @Min(0)
  rateWeekend: number;

  @IsNumber()
  @Min(0)
  rateEvent: number;
}

export class UpdateRoomDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rateStandard?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rateWeekend?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rateEvent?: number;

  @IsOptional()
  @IsEnum(RoomStatus)
  status?: RoomStatus;
}

export class RoomResponseDto {
  id: string;
  roomNumber: string;
  type: string;
  rateStandard: number;
  rateWeekend: number;
  rateEvent: number;
  status: RoomStatus;
  currentReservation?: {
    id: string;
    guestName: string;
    checkIn: Date;
    checkOut: Date;
  };
}

// ==================== RESERVATION DTOs ====================

export class CheckInDto {
  @IsUUID()
  roomId: string;

  @IsString()
  guestName: string;

  @IsString()
  idNumber: string;

  @IsDateString()
  checkIn: string;

  @IsDateString()
  checkOut: string;

  @IsNumber()
  @Min(0)
  rateApplied: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  advancePayment?: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  mpesaRef?: string;
}

export class CheckOutDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  additionalCharges?: number;

  @IsOptional()
  @IsString()
  additionalChargesDescription?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  finalPayment?: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  mpesaRef?: string;
}

export class ReservationResponseDto {
  id: string;
  room: {
    id: string;
    roomNumber: string;
    type: string;
  };
  guestName: string;
  idNumber: string;
  checkIn: Date;
  checkOut: Date;
  rateApplied: number;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  status: string;
  createdAt: Date;
}

// ==================== FOLIO DTOs ====================

export class RoomFolioDto {
  reservationId: string;
  guestName: string;
  idNumber: string;
  roomNumber: string;
  roomType: string;
  checkIn: Date;
  checkOut: Date;
  nights: number;
  ratePerNight: number;
  roomCharges: number;
  additionalCharges: number;
  totalCharges: number;
  payments: Array<{
    date: Date;
    description: string;
    amount: number;
    paymentMethod: string;
    reference?: string;
  }>;
  amountPaid: number;
  balance: number;
}

// ==================== OCCUPANCY DTOs ====================

export class OccupancyReportDto {
  date: Date;
  totalRooms: number;
  occupiedRooms: number;
  vacantRooms: number;
  maintenanceRooms: number;
  reservedRooms: number;
  occupancyRate: number;
  adr: number; // Average Daily Rate
  revpar: number; // Revenue Per Available Room
  totalRevenue: number;
  reservations: Array<{
    guestName: string;
    roomNumber: string;
    checkIn: Date;
    checkOut: Date;
    rate: number;
    status: string;
  }>;
}

// ==================== ADVANCED SEARCH DTOs ====================

export class SearchRoomsDto {
  @IsOptional()
  @IsDateString()
  checkIn?: string;

  @IsOptional()
  @IsDateString()
  checkOut?: string;

  @IsOptional()
  @IsString()
  roomType?: string;

  @IsOptional()
  @IsEnum(RoomStatus)
  status?: RoomStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxRate?: number;
}

export class AvailableRoomDto {
  id: string;
  roomNumber: string;
  type: string;
  rateStandard: number;
  rateWeekend: number;
  rateEvent: number;
  status: RoomStatus;
  isAvailable: boolean;
  nextReservation?: {
    checkIn: Date;
    checkOut: Date;
    guestName: string;
  };
}

// ==================== RESERVATION MANAGEMENT DTOs ====================

export class CreateReservationDto {
  @IsUUID()
  roomId: string;

  @IsString()
  guestName: string;

  @IsString()
  idNumber: string;

  @IsDateString()
  checkIn: string;

  @IsDateString()
  checkOut: string;

  @IsNumber()
  @Min(0)
  rateApplied: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deposit?: number;
}

export class UpdateReservationDto {
  @IsOptional()
  @IsDateString()
  checkIn?: string;

  @IsOptional()
  @IsDateString()
  checkOut?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rateApplied?: number;

  @IsOptional()
  @IsString()
  status?: string;
}

// ==================== PAYMENT DTOs ====================

export class RecordPaymentDto {
  @IsUUID()
  reservationId: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsOptional()
  @IsString()
  mpesaRef?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
