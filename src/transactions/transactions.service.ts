import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTransactionDto,
  VoidTransactionDto,
  TransactionResponseDto,
} from './dto/transaction.dto';
import { Division, PaymentMethod } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  async createTransaction(
    userId: string,
    createTransactionDto: CreateTransactionDto,
  ): Promise<TransactionResponseDto> {
    // Verify user has an active shift
    const activeShift = await this.prisma.shift.findFirst({
      where: {
        userId,
        closedAt: null,
        division: createTransactionDto.division,
      },
    });

    if (!activeShift) {
      throw new BadRequestException(
        `You must have an active shift in ${createTransactionDto.division} division to create transactions`,
      );
    }

    // Handle discount approval
    if (createTransactionDto.discount && createTransactionDto.discount > 0) {
      if (!createTransactionDto.supervisorPin) {
        throw new BadRequestException('Supervisor PIN required for discounts');
      }

      const supervisors = await this.prisma.user.findMany({
        where: {
          role: { in: ['SUPERVISOR', 'MANAGER', 'OWNER'] },
          isActive: true,
        },
      });

      let supervisorApproved = false;
      for (const supervisor of supervisors) {
        if (await bcrypt.compare(createTransactionDto.supervisorPin, supervisor.pin)) {
          supervisorApproved = true;
          break;
        }
      }

      if (!supervisorApproved) {
        throw new ForbiddenException('Invalid supervisor PIN');
      }
    }

    // Calculate total amount
    let totalAmount = createTransactionDto.lineItems.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    );

    if (createTransactionDto.discount) {
      totalAmount -= createTransactionDto.discount;
    }

    if (totalAmount < 0) {
      throw new BadRequestException('Transaction amount cannot be negative');
    }

    // Verify Mpesa reference if Mpesa payment
    if (createTransactionDto.paymentMethod === 'MPESA' && !createTransactionDto.mpesaRef) {
      throw new BadRequestException('Mpesa reference code is required for Mpesa payments');
    }

    // Create transaction with journal entries in a single database transaction
    const transaction = await this.prisma.$transaction(async (prisma) => {
      // Create the transaction
      const newTransaction = await prisma.transaction.create({
        data: {
          division: createTransactionDto.division,
          type: createTransactionDto.reservationId ? 'ROOM_SALE' : 'SALE',
          amount: totalAmount,
          paymentMethod: createTransactionDto.paymentMethod,
          mpesaRef: createTransactionDto.mpesaRef,
          shiftId: activeShift.id,
          userId,
          reservationId: createTransactionDto.reservationId,
          lineItems: {
            create: createTransactionDto.lineItems.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              lineTotal: item.quantity * item.unitPrice,
            })),
          },
        },
        include: {
          lineItems: {
            include: {
              product: {
                select: {
                  name: true,
                  sku: true,
                  costPrice: true,
                  stockItemId: true,
                },
              },
            },
          },
          user: {
            select: {
              id: true,
              name: true,
            },
          },
          shift: {
            select: {
              id: true,
            },
          },
        },
      });

      // Create double-entry journal entries
      // Debit: Cash/Mpesa Receivable account
      const cashAccountCode =
        createTransactionDto.paymentMethod === 'CASH' ? '1000' : '1010';
      
      await prisma.journalEntry.create({
        data: {
          transactionId: newTransaction.id,
          accountCode: `${cashAccountCode}-${createTransactionDto.division}`,
          debit: totalAmount,
          credit: 0,
          description: `Sale - ${createTransactionDto.paymentMethod}`,
        },
      });

      // Credit: Revenue account
      const revenueAccountMap = {
        HOTEL: '4000',
        BAR: '4100',
        LIQUOR_STORE: '4200',
        FAST_FOOD: '4300',
      };

      await prisma.journalEntry.create({
        data: {
          transactionId: newTransaction.id,
          accountCode: `${revenueAccountMap[createTransactionDto.division]}-${createTransactionDto.division}`,
          debit: 0,
          credit: totalAmount,
          description: `Sale revenue`,
        },
      });

      // Deduct stock for products with linked stock items
      for (const lineItem of newTransaction.lineItems) {
        if (lineItem.product.stockItemId) {
          // Record stock movement
          await prisma.stockMovement.create({
            data: {
              stockItemId: lineItem.product.stockItemId,
              division: createTransactionDto.division,
              movementType: 'SALE',
              quantity: -lineItem.quantity, // Negative for deduction
              referenceId: newTransaction.id,
              referenceType: 'TRANSACTION',
              createdBy: userId,
            },
          });

          // Create COGS journal entries
          const cogsAmount = Number(lineItem.product.costPrice) * Number(lineItem.quantity);
          
          // Debit: COGS
          await prisma.journalEntry.create({
            data: {
              transactionId: newTransaction.id,
              accountCode: `5000-${createTransactionDto.division}`,
              debit: cogsAmount,
              credit: 0,
              description: `COGS - ${lineItem.product.name}`,
            },
          });

          // Credit: Stock Asset
          await prisma.journalEntry.create({
            data: {
              transactionId: newTransaction.id,
              accountCode: `1100-${createTransactionDto.division}`,
              debit: 0,
              credit: cogsAmount,
              description: `Stock deduction - ${lineItem.product.name}`,
            },
          });
        }
      }

      // If Mpesa, create a pending Mpesa transaction record
      if (createTransactionDto.paymentMethod === 'MPESA') {
        await prisma.mpesaTransaction.create({
          data: {
            transactionRef: createTransactionDto.mpesaRef!,
            amount: totalAmount,
            msisdn: 'UNKNOWN', // Will be updated from Daraja callback
            division: createTransactionDto.division,
            timestamp: new Date(),
            status: 'PENDING',
            matchedTransactionId: newTransaction.id,
          },
        });
      }

      // Log the transaction
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'CREATE',
          tableName: 'transactions',
          recordId: newTransaction.id,
          afterJson: {
            amount: totalAmount.toString(),
            paymentMethod: createTransactionDto.paymentMethod,
            lineItemsCount: createTransactionDto.lineItems.length,
          },
        },
      });

      return newTransaction;
    });

    return this.formatTransactionResponse(transaction);
  }

  async voidTransaction(
    userId: string,
    transactionId: string,
    voidDto: VoidTransactionDto,
  ): Promise<TransactionResponseDto> {
    // Verify manager PIN
    const managers = await this.prisma.user.findMany({
      where: {
        role: { in: ['MANAGER', 'OWNER'] },
        isActive: true,
      },
    });

    let managerApproved = false;
    let managerId: string | null = null;
    for (const manager of managers) {
      if (await bcrypt.compare(voidDto.managerPin, manager.pin)) {
        managerApproved = true;
        managerId = manager.id;
        break;
      }
    }

    if (!managerApproved) {
      throw new ForbiddenException('Invalid manager PIN');
    }

    // Get the transaction
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        journalEntries: true,
        lineItems: {
          include: {
            product: {
              select: {
                name: true,
                sku: true,
                stockItemId: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            name: true,
          },
        },
        shift: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (transaction.isReversed) {
      throw new BadRequestException('Transaction is already voided');
    }

    // Void the transaction with reversing entries
    const voidedTransaction = await this.prisma.$transaction(async (prisma) => {
      // Mark as reversed
      const updated = await prisma.transaction.update({
        where: { id: transactionId },
        data: {
          isReversed: true,
          reversalReason: voidDto.reason,
        },
        include: {
          lineItems: {
            include: {
              product: {
                select: {
                  name: true,
                  sku: true,
                  stockItemId: true,
                },
              },
            },
          },
          user: {
            select: {
              id: true,
              name: true,
            },
          },
          shift: {
            select: {
              id: true,
            },
          },
        },
      });

      // Create reversing journal entries
      for (const entry of transaction.journalEntries) {
        await prisma.journalEntry.create({
          data: {
            transactionId,
            accountCode: entry.accountCode,
            debit: Number(entry.credit), // Swap debit and credit
            credit: Number(entry.debit),
            description: `VOID - ${entry.description}`,
          },
        });
      }

      // Reverse stock movements
      for (const lineItem of transaction.lineItems) {
        if (lineItem.product.stockItemId) {
          await prisma.stockMovement.create({
            data: {
              stockItemId: lineItem.product.stockItemId,
              division: transaction.division,
              movementType: 'ADJUSTMENT',
              quantity: lineItem.quantity, // Positive to add back
              referenceId: transactionId,
              referenceType: 'VOID',
              notes: `Void: ${voidDto.reason}`,
              createdBy: managerId!,
            },
          });
        }
      }

      // Log the void
      await prisma.auditLog.create({
        data: {
          userId: managerId!,
          action: 'VOID',
          tableName: 'transactions',
          recordId: transactionId,
          beforeJson: { isReversed: false },
          afterJson: {
            isReversed: true,
            reason: voidDto.reason,
            voidedBy: managerId,
          },
        },
      });

      // Create alert
      await prisma.alert.create({
        data: {
          type: 'VOID_TRANSACTION',
          severity: 'WARNING',
          division: transaction.division,
          description: `Transaction ${transactionId} voided. Amount: KES ${Number(transaction.amount).toFixed(2)}. Reason: ${voidDto.reason}`,
        },
      });

      return updated;
    });

    return this.formatTransactionResponse(voidedTransaction);
  }

  async getTransactionsByShift(shiftId: string): Promise<TransactionResponseDto[]> {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        shiftId,
        isReversed: false,
      },
      include: {
        lineItems: {
          include: {
            product: {
              select: {
                name: true,
                sku: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            name: true,
          },
        },
        shift: {
          select: {
            id: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return transactions.map((t) => this.formatTransactionResponse(t));
  }

  private formatTransactionResponse(transaction: any): TransactionResponseDto {
    return {
      id: transaction.id,
      division: transaction.division,
      type: transaction.type,
      amount: Number(transaction.amount),
      paymentMethod: transaction.paymentMethod,
      mpesaRef: transaction.mpesaRef,
      isReversed: transaction.isReversed,
      shift: transaction.shift,
      user: transaction.user,
      lineItems: transaction.lineItems.map((item: any) => ({
        id: item.id,
        product: {
          name: item.product.name,
          sku: item.product.sku,
        },
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        lineTotal: Number(item.lineTotal),
      })),
      createdAt: transaction.createdAt,
    };
  }
}
