import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TransactionsService } from './transactions.service';
import {
  CreateTransactionDto,
  VoidTransactionDto,
  TransactionResponseDto,
} from './dto/transaction.dto';

@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  async createTransaction(
    @Request() req,
    @Body() createTransactionDto: CreateTransactionDto,
  ): Promise<TransactionResponseDto> {
    return this.transactionsService.createTransaction(
      req.user.userId,
      createTransactionDto,
    );
  }

  @Post(':id/void')
  async voidTransaction(
    @Request() req,
    @Param('id') transactionId: string,
    @Body() voidDto: VoidTransactionDto,
  ): Promise<TransactionResponseDto> {
    return this.transactionsService.voidTransaction(
      req.user.userId,
      transactionId,
      voidDto,
    );
  }

  @Get('shift/:shiftId')
  async getTransactionsByShift(
    @Param('shiftId') shiftId: string,
  ): Promise<TransactionResponseDto[]> {
    return this.transactionsService.getTransactionsByShift(shiftId);
  }
}
