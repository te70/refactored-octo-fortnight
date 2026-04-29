import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ShiftsService } from './shifts.service';
import { OpenShiftDto, CloseShiftDto, ShiftSummaryDto } from './dto/shift.dto';
import { Division } from '@prisma/client';

@Controller('shifts')
@UseGuards(JwtAuthGuard)
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Post('open')
  async openShift(
    @Request() req,
    @Body() openShiftDto: OpenShiftDto,
  ): Promise<ShiftSummaryDto> {
    return this.shiftsService.openShift(req.user.userId, openShiftDto);
  }

  @Post(':id/close')
  async closeShift(
    @Request() req,
    @Param('id') shiftId: string,
    @Body() closeShiftDto: CloseShiftDto,
  ): Promise<ShiftSummaryDto> {
    return this.shiftsService.closeShift(req.user.userId, shiftId, closeShiftDto);
  }

  @Get('active')
  async getActiveShift(@Request() req): Promise<ShiftSummaryDto | null> {
    return this.shiftsService.getActiveShift(req.user.userId);
  }

  @Get('history')
  async getShiftHistory(
    @Request() req,
    @Query('division') division?: Division,
  ): Promise<ShiftSummaryDto[]> {
    return this.shiftsService.getShiftHistory(req.user.userId, division);
  }
}
