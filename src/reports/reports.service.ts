import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DailyPlQueryDto,
  DailyPlReportDto,
  StockReportQueryDto,
  StockReportDto,
  ShiftSummaryDto,
  MpesaReconciliationQueryDto,
  MpesaReconciliationReportDto,
  SalesSummaryQueryDto,
  SalesSummaryDto,
} from './dto/reports.dto';
import { Division, PaymentMethod } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  // ==================== DAILY P&L ====================

  async getDailyPl(queryDto: DailyPlQueryDto): Promise<DailyPlReportDto> {
    const date = new Date(queryDto.date);
    const startOfDay = new Date(date.setHours(0, 0, 0, 0));
    const endOfDay = new Date(date.setHours(23, 59, 59, 999));

    // Get all transactions for the day
    const transactions = await this.prisma.transaction.findMany({
      where: {
        division: queryDto.division,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
        isReversed: false,
      },
      include: {
        lineItems: {
          include: {
            product: {
              include: {
                stockItem: true,
              },
            },
          },
        },
      },
    });

    // Calculate revenue by payment method
    const cashRevenue = transactions
      .filter((t) => t.paymentMethod === PaymentMethod.CASH)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const mpesaRevenue = transactions
      .filter((t) => t.paymentMethod === PaymentMethod.MPESA)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const totalRevenue = cashRevenue + mpesaRevenue;

    // Calculate COGS
    let totalCogs = 0;
    const categoryBreakdown = new Map<
      string,
      { revenue: number; cogs: number }
    >();

    for (const transaction of transactions) {
      for (const lineItem of transaction.lineItems) {
        const costPrice = lineItem.product.stockItem
          ? Number(lineItem.product.stockItem.costPrice)
          : Number(lineItem.product.costPrice);

        const itemCogs = costPrice * Number(lineItem.quantity);
        totalCogs += itemCogs;

        const category = lineItem.product.category;
        const existing = categoryBreakdown.get(category) || {
          revenue: 0,
          cogs: 0,
        };

        categoryBreakdown.set(category, {
          revenue: existing.revenue + Number(lineItem.lineTotal),
          cogs: existing.cogs + itemCogs,
        });
      }
    }

    const grossProfit = totalRevenue - totalCogs;
    const grossProfitMargin =
      totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    // Format breakdown
    const breakdown = Array.from(categoryBreakdown.entries()).map(
      ([category, data]) => ({
        category,
        revenue: Number(data.revenue.toFixed(2)),
        cogs: Number(data.cogs.toFixed(2)),
        profit: Number((data.revenue - data.cogs).toFixed(2)),
        margin:
          data.revenue > 0
            ? Number((((data.revenue - data.cogs) / data.revenue) * 100).toFixed(2))
            : 0,
      }),
    );

    return {
      division: queryDto.division,
      date: new Date(queryDto.date),
      revenue: {
        cash: Number(cashRevenue.toFixed(2)),
        mpesa: Number(mpesaRevenue.toFixed(2)),
        total: Number(totalRevenue.toFixed(2)),
      },
      cogs: Number(totalCogs.toFixed(2)),
      grossProfit: Number(grossProfit.toFixed(2)),
      grossProfitMargin: Number(grossProfitMargin.toFixed(2)),
      transactionCount: transactions.length,
      breakdown,
    };
  }

  // ==================== STOCK REPORT ====================

  async getStockReport(queryDto: StockReportQueryDto): Promise<StockReportDto> {
    const date = queryDto.date ? new Date(queryDto.date) : new Date();
    const startOfDay = new Date(date.setHours(0, 0, 0, 0));
    const endOfDay = new Date(date.setHours(23, 59, 59, 999));

    // Get all stock items for division
    const stockItems = await this.prisma.stockItem.findMany({
      where: {
        division: queryDto.division,
      },
      include: {
        movements: true,
      },
    });

    let totalValue = 0;
    let lowStockCount = 0;

    const items = stockItems.map((item) => {
      // Calculate current stock
      const currentStock = item.movements.reduce(
        (sum, movement) => sum + Number(movement.quantity),
        0,
      );

      const stockValue = currentStock * Number(item.costPrice);
      totalValue += stockValue;

      const isLowStock = currentStock <= Number(item.reorderLevel);
      if (isLowStock) lowStockCount++;

      return {
        name: item.name,
        sku: item.sku,
        currentStock: Number(currentStock.toFixed(2)),
        unit: item.unit,
        costPrice: Number(item.costPrice),
        stockValue: Number(stockValue.toFixed(2)),
        reorderLevel: Number(item.reorderLevel),
        isLowStock,
      };
    });

    // Get movements for the day
    const movements = await this.prisma.stockMovement.findMany({
      where: {
        division: queryDto.division,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        stockItem: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const movementsFormatted = movements.map((m) => ({
      stockItemName: m.stockItem.name,
      movementType: m.movementType,
      quantity: Number(m.quantity),
      timestamp: m.createdAt,
    }));

    return {
      division: queryDto.division,
      date,
      totalValue: Number(totalValue.toFixed(2)),
      totalItems: stockItems.length,
      lowStockItems: lowStockCount,
      items,
      movements: movementsFormatted,
    };
  }

  // ==================== SHIFT SUMMARY ====================

  async getShiftSummary(shiftId: string): Promise<ShiftSummaryDto> {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      include: {
        user: {
          select: {
            name: true,
            role: true,
          },
        },
        transactions: {
          include: {
            lineItems: {
              include: {
                product: true,
              },
            },
          },
        },
      },
    });

    if (!shift) {
      throw new NotFoundException('Shift not found');
    }

    // Calculate revenue
    const validTransactions = shift.transactions.filter((t) => !t.isReversed);

    const cashRevenue = validTransactions
      .filter((t) => t.paymentMethod === PaymentMethod.CASH)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const mpesaRevenue = validTransactions
      .filter((t) => t.paymentMethod === PaymentMethod.MPESA)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const totalRevenue = cashRevenue + mpesaRevenue;

    // Count voids
    const voidCount = shift.transactions.filter((t) => t.isReversed).length;

    // Calculate top products
    const productSales = new Map<
      string,
      { quantity: number; revenue: number }
    >();

    for (const transaction of validTransactions) {
      for (const lineItem of transaction.lineItems) {
        const existing = productSales.get(lineItem.product.name) || {
          quantity: 0,
          revenue: 0,
        };

        productSales.set(lineItem.product.name, {
          quantity: existing.quantity + Number(lineItem.quantity),
          revenue: existing.revenue + Number(lineItem.lineTotal),
        });
      }
    }

    const topProducts = Array.from(productSales.entries())
      .map(([name, data]) => ({
        productName: name,
        quantitySold: Number(data.quantity.toFixed(2)),
        revenue: Number(data.revenue.toFixed(2)),
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return {
      shiftId: shift.id,
      user: {
        name: shift.user.name,
        role: shift.user.role,
      },
      division: shift.division,
      openedAt: shift.openedAt,
      closedAt: shift.closedAt || undefined,
      openingFloat: Number(shift.openingFloat),
      closingCount: shift.closingCount ? Number(shift.closingCount) : undefined,
      mpesaTotal: shift.mpesaTotal ? Number(shift.mpesaTotal) : undefined,
      variance: shift.variance ? Number(shift.variance) : undefined,
      revenue: {
        cash: Number(cashRevenue.toFixed(2)),
        mpesa: Number(mpesaRevenue.toFixed(2)),
        total: Number(totalRevenue.toFixed(2)),
      },
      transactionCount: validTransactions.length,
      voidCount,
      topProducts,
    };
  }

  // ==================== MPESA RECONCILIATION ====================

  async getMpesaReconciliation(
    queryDto: MpesaReconciliationQueryDto,
  ): Promise<MpesaReconciliationReportDto> {
    const date = new Date(queryDto.date);
    const startOfDay = new Date(date.setHours(0, 0, 0, 0));
    const endOfDay = new Date(date.setHours(23, 59, 59, 999));

    // Get POS transactions
    const posTransactions = await this.prisma.transaction.findMany({
      where: {
        ...(queryDto.division && { division: queryDto.division }),
        paymentMethod: PaymentMethod.MPESA,
        isReversed: false,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    // Get Daraja transactions
    const darajaTransactions = await this.prisma.mpesaTransaction.findMany({
      where: {
        ...(queryDto.division && { division: queryDto.division }),
        timestamp: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    const posTotal = posTransactions.reduce(
      (sum, t) => sum + Number(t.amount),
      0,
    );
    const darajaTotal = darajaTransactions.reduce(
      (sum, t) => sum + Number(t.amount),
      0,
    );
    const variance = posTotal - darajaTotal;

    // Find matched transactions
        const matched: Array<{
        transactionRef: string;
        amount: number;
        timestamp: Date;
        }> = [];

        const unmatchedPos: Array<{
        transactionId: string;
        mpesaRef: string;
        amount: number;
        timestamp: Date;
        }> = [];
        
    for (const posTransaction of posTransactions) {
      const darajaMatch = darajaTransactions.find(
        (d) => d.transactionRef === posTransaction.mpesaRef,
      );

      if (darajaMatch) {
        matched.push({
          transactionRef: darajaMatch.transactionRef,
          amount: Number(darajaMatch.amount),
          timestamp: darajaMatch.timestamp,
        });
      } else {
        unmatchedPos.push({
          transactionId: posTransaction.id,
          mpesaRef: posTransaction.mpesaRef || 'MISSING',
          amount: Number(posTransaction.amount),
          timestamp: posTransaction.createdAt,
        });
      }
    }

    // Find unmatched Daraja transactions
    const matchedRefs = new Set(matched.map((m) => m.transactionRef));
    const unmatchedDaraja = darajaTransactions
      .filter((d) => !matchedRefs.has(d.transactionRef))
      .map((d) => ({
        transactionRef: d.transactionRef,
        amount: Number(d.amount),
        msisdn: d.msisdn,
        timestamp: d.timestamp,
      }));

    return {
      division: queryDto.division,
      date: new Date(queryDto.date),
      posTotal: Number(posTotal.toFixed(2)),
      darajaTotal: Number(darajaTotal.toFixed(2)),
      variance: Number(variance.toFixed(2)),
      matchedCount: matched.length,
      unmatchedPosCount: unmatchedPos.length,
      unmatchedDarajaCount: unmatchedDaraja.length,
      matched,
      unmatchedPos,
      unmatchedDaraja,
    };
  }

  // ==================== SALES SUMMARY ====================

  async getSalesSummary(
    queryDto: SalesSummaryQueryDto,
  ): Promise<SalesSummaryDto> {
    const startDate = new Date(queryDto.startDate);
    const endDate = new Date(queryDto.endDate);
    endDate.setHours(23, 59, 59, 999);

    const transactions = await this.prisma.transaction.findMany({
      where: {
        division: queryDto.division,
        isReversed: false,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        lineItems: {
          include: {
            product: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Calculate totals
    const totalRevenue = transactions.reduce(
      (sum, t) => sum + Number(t.amount),
      0,
    );
    const totalTransactions = transactions.length;
    const averageTransactionValue =
      totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    // Payment method breakdown
    const cashRevenue = transactions
      .filter((t) => t.paymentMethod === PaymentMethod.CASH)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const mpesaRevenue = transactions
      .filter((t) => t.paymentMethod === PaymentMethod.MPESA)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    // Top products
    const productSales = new Map<
      string,
      { quantity: number; revenue: number }
    >();

    for (const transaction of transactions) {
      for (const lineItem of transaction.lineItems) {
        const existing = productSales.get(lineItem.product.name) || {
          quantity: 0,
          revenue: 0,
        };

        productSales.set(lineItem.product.name, {
          quantity: existing.quantity + Number(lineItem.quantity),
          revenue: existing.revenue + Number(lineItem.lineTotal),
        });
      }
    }

    const topProducts = Array.from(productSales.entries())
      .map(([name, data]) => ({
        name,
        quantitySold: Number(data.quantity.toFixed(2)),
        revenue: Number(data.revenue.toFixed(2)),
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 20);

    // Daily breakdown
    const dailyMap = new Map<string, { revenue: number; count: number }>();

    for (const transaction of transactions) {
      const dateKey = transaction.createdAt.toISOString().split('T')[0];
      const existing = dailyMap.get(dateKey) || { revenue: 0, count: 0 };

      dailyMap.set(dateKey, {
        revenue: existing.revenue + Number(transaction.amount),
        count: existing.count + 1,
      });
    }

    const dailyBreakdown = Array.from(dailyMap.entries())
      .map(([dateStr, data]) => ({
        date: new Date(dateStr),
        revenue: Number(data.revenue.toFixed(2)),
        transactions: data.count,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    return {
      division: queryDto.division,
      startDate: new Date(queryDto.startDate),
      endDate: new Date(queryDto.endDate),
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalTransactions,
      averageTransactionValue: Number(averageTransactionValue.toFixed(2)),
      paymentMethods: {
        cash: Number(cashRevenue.toFixed(2)),
        mpesa: Number(mpesaRevenue.toFixed(2)),
      },
      topProducts,
      dailyBreakdown,
    };
  }

  // ==================== PDF EXPORT (using simple HTML) ====================

  async exportDailyPlPdf(queryDto: DailyPlQueryDto): Promise<string> {
    const report = await this.getDailyPl(queryDto);
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { color: #333; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #4CAF50; color: white; }
          .summary { background-color: #f9f9f9; padding: 15px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <h1>Daily P&L Report</h1>
        <p><strong>Division:</strong> ${report.division}</p>
        <p><strong>Date:</strong> ${report.date.toLocaleDateString()}</p>
        
        <div class="summary">
          <h2>Summary</h2>
          <p><strong>Total Revenue:</strong> KES ${report.revenue.total.toLocaleString()}</p>
          <p><strong>Cash:</strong> KES ${report.revenue.cash.toLocaleString()}</p>
          <p><strong>M-Pesa:</strong> KES ${report.revenue.mpesa.toLocaleString()}</p>
          <p><strong>COGS:</strong> KES ${report.cogs.toLocaleString()}</p>
          <p><strong>Gross Profit:</strong> KES ${report.grossProfit.toLocaleString()}</p>
          <p><strong>Margin:</strong> ${report.grossProfitMargin.toFixed(2)}%</p>
          <p><strong>Transactions:</strong> ${report.transactionCount}</p>
        </div>
        
        <h2>Category Breakdown</h2>
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Revenue</th>
              <th>COGS</th>
              <th>Profit</th>
              <th>Margin %</th>
            </tr>
          </thead>
          <tbody>
            ${report.breakdown.map(item => `
              <tr>
                <td>${item.category}</td>
                <td>KES ${item.revenue.toLocaleString()}</td>
                <td>KES ${item.cogs.toLocaleString()}</td>
                <td>KES ${item.profit.toLocaleString()}</td>
                <td>${item.margin.toFixed(2)}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;
    
    return html;
  }
}
