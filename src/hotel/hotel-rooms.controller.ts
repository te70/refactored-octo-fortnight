import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
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
import { HotelRoomsService } from './hotel-rooms.service';
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
} from './dto/hotel-rooms.dto';

@Controller('hotel-rooms')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HotelRoomsController {
  constructor(private readonly hotelRoomsService: HotelRoomsService) {}

  // ==================== ROOMS ====================

  @Post()
  @Roles('MANAGER', 'OWNER')
  @HttpCode(HttpStatus.CREATED)
  async createRoom(
    @Request() req,
    @Body() createRoomDto: CreateRoomDto,
  ): Promise<RoomResponseDto> {
    return this.hotelRoomsService.createRoom(createRoomDto, req.user.userId);
  }

  @Get()
  async getAllRooms(): Promise<RoomResponseDto[]> {
    return this.hotelRoomsService.getAllRooms();
  }

  @Get(':id')
  async getRoomById(@Param('id') id: string): Promise<RoomResponseDto> {
    return this.hotelRoomsService.getRoomById(id);
  }

  @Put(':id')
  @Roles('MANAGER', 'OWNER')
  async updateRoom(
    @Request() req,
    @Param('id') id: string,
    @Body() updateRoomDto: UpdateRoomDto,
  ): Promise<RoomResponseDto> {
    return this.hotelRoomsService.updateRoom(id, updateRoomDto, req.user.userId);
  }

  // ==================== CHECK-IN / CHECK-OUT ====================

  @Post('check-in')
  @Roles('RECEPTIONIST', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @HttpCode(HttpStatus.CREATED)
  async checkIn(@Request() req, @Body() checkInDto: CheckInDto): Promise<ReservationResponseDto> {
    return this.hotelRoomsService.checkIn(checkInDto, req.user.userId);
  }

  @Post('check-out/:reservationId')
  @Roles('RECEPTIONIST', 'SUPERVISOR', 'MANAGER', 'OWNER')
  async checkOut(
    @Request() req,
    @Param('reservationId') reservationId: string,
    @Body() checkOutDto: CheckOutDto,
  ): Promise<{ reservation: ReservationResponseDto; folio: RoomFolioDto }> {
    return this.hotelRoomsService.checkOut(reservationId, checkOutDto, req.user.userId);
  }

  // ==================== FOLIO ====================

  @Get('folio/:reservationId')
  async getFolio(@Param('reservationId') reservationId: string): Promise<RoomFolioDto> {
    return this.hotelRoomsService.generateFolio(reservationId);
  }

  // ==================== OCCUPANCY REPORTS ====================

  @Get('reports/occupancy')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  async getOccupancyReport(@Query('date') date?: string): Promise<OccupancyReportDto> {
    const reportDate = date ? new Date(date) : new Date();
    return this.hotelRoomsService.getOccupancyReport(reportDate);
  }

  // ==================== ROOM SEARCH ====================

  @Get('search/available')
  async searchAvailableRooms(@Query() searchDto: SearchRoomsDto): Promise<AvailableRoomDto[]> {
    return this.hotelRoomsService.searchAvailableRooms(searchDto);
  }

  // ==================== RESERVATIONS ====================

  @Post('reservations')
  @Roles('RECEPTIONIST', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @HttpCode(HttpStatus.CREATED)
  async createReservation(
    @Request() req,
    @Body() createReservationDto: CreateReservationDto,
  ): Promise<ReservationResponseDto> {
    return this.hotelRoomsService.createReservation(createReservationDto, req.user.userId);
  }

  @Put('reservations/:id')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  async updateReservation(
    @Request() req,
    @Param('id') id: string,
    @Body() updateReservationDto: UpdateReservationDto,
  ): Promise<ReservationResponseDto> {
    return this.hotelRoomsService.updateReservation(id, updateReservationDto, req.user.userId);
  }

  @Delete('reservations/:id')
  @Roles('MANAGER', 'OWNER')
  @HttpCode(HttpStatus.OK)
  async cancelReservation(
    @Request() req,
    @Param('id') id: string,
  ): Promise<ReservationResponseDto> {
    return this.hotelRoomsService.cancelReservation(id, req.user.userId);
  }
}
