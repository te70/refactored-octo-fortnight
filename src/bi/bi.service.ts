import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  RevenueAnalyticsQueryDto,
  RevenueAnalyticsDto,
  StockVarianceAnalyticsDto,
  StaffPerformanceQueryDto,
  StaffPerformanceDto,
  RevenueForecastQueryDto,
  RevenueForecastDto,
  ProductAnalyticsQueryDto,
  ProductAnalyticsDto,
  DivisionComparisonQueryDto,
  DivisionComparisonDto,
  CustomerInsightsDto,
} from './dto/bi.dto';
import { Division, PaymentMethod } from '@prisma/client';

@Injectable()
export class BiService {
  constructor(private prisma: PrismaService) {}

  // ==================== REVENUE ANALYTICS ====================

  async getRevenueAnalytics(
    queryDto: RevenueAnalyticsQueryDto,
  ): Promise<RevenueAnalyticsDto> {
    const startDate = new Date(queryDto.startDate);
    const endDate = new Date(queryDto.endDate);
    endDate.setHours(23, 59, 59, 999);

    // Get all transactions
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
            product: {
              include: {
                stockItem: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const totalRevenue = transactions.reduce((sum, t) => sum + Number(t.amount), 0);
    const totalTransactions = transactions.length;
    const averageTransactionValue =
      totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    // Daily revenue
    const dailyMap = new Map<string, { revenue: number; count: number }>();
    transactions.forEach((t) => {
      const dateKey = t.createdAt.toISOString().split('T')[0];
      const existing = dailyMap.get(dateKey) || { revenue: 0, count: 0 };
      dailyMap.set(dateKey, {
        revenue: existing.revenue + Number(t.amount),
        count: existing.count + 1,
      });
    });

    const dailyRevenue = Array.from(dailyMap.entries())
      .map(([dateStr, data]) => ({
        date: new Date(dateStr),
        revenue: Number(data.revenue.toFixed(2)),
        transactions: data.count,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    // Revenue by payment method
    const cashRevenue = transactions
      .filter((t) => t.paymentMethod === PaymentMethod.CASH)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const mpesaRevenue = transactions
      .filter((t) => t.paymentMethod === PaymentMethod.MPESA)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    // Top products
    const productSales = new Map<
      string,
      { name: string; quantity: number; revenue: number }
    >();

    transactions.forEach((t) => {
      t.lineItems.forEach((item) => {
        const existing = productSales.get(item.productId) || {
          name: item.product.name,
          quantity: 0,
          revenue: 0,
        };
        productSales.set(item.productId, {
          name: item.product.name,
          quantity: existing.quantity + Number(item.quantity),
          revenue: existing.revenue + Number(item.lineTotal),
        });
      });
    });

    const topProducts = Array.from(productSales.entries())
      .map(([productId, data]) => ({
        productId,
        productName: data.name,
        quantitySold: Number(data.quantity.toFixed(2)),
        revenue: Number(data.revenue.toFixed(2)),
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Peak hours
    const hourMap = new Map<number, { count: number; revenue: number }>();
    transactions.forEach((t) => {
      const hour = t.createdAt.getHours();
      const existing = hourMap.get(hour) || { count: 0, revenue: 0 };
      hourMap.set(hour, {
        count: existing.count + 1,
        revenue: existing.revenue + Number(t.amount),
      });
    });

    const peakHours = Array.from(hourMap.entries())
      .map(([hour, data]) => ({
        hour,
        transactions: data.count,
        revenue: Number(data.revenue.toFixed(2)),
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return {
      division: queryDto.division,
      startDate: new Date(queryDto.startDate),
      endDate: new Date(queryDto.endDate),
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalTransactions,
      averageTransactionValue: Number(averageTransactionValue.toFixed(2)),
      dailyRevenue,
      revenueByPaymentMethod: {
        cash: Number(cashRevenue.toFixed(2)),
        mpesa: Number(mpesaRevenue.toFixed(2)),
      },
      topProducts,
      peakHours,
    };
  }

  // ==================== STOCK VARIANCE ANALYTICS ====================

  async getStockVarianceAnalytics(
    division: Division,
  ): Promise<StockVarianceAnalyticsDto> {
    const stockItems = await this.prisma.stockItem.findMany({
      where: { division },
      include: {
        movements: true,
      },
    });

    const varianceHeatmap: Array<{
      stockItemId: string;
      stockItemName: string;
      expectedStock: number;
      actualStock: number;
      variance: number;
      variancePercentage: number;
      varianceValue: number;
      severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    }> = [];

    let totalVarianceValue = 0;
    let itemsWithVariance = 0;

    stockItems.forEach((item) => {
      const currentStock = item.movements.reduce(
        (sum, m) => sum + Number(m.quantity),
        0,
      );

      // For demonstration, we'll assume expected stock = current stock
      // In real scenario, this would come from stock counts
      const expectedStock = currentStock;
      const actualStock = currentStock;
      const variance = actualStock - expectedStock;
      const variancePercentage =
        expectedStock !== 0 ? Math.abs((variance / expectedStock) * 100) : 0;
      const varianceValue = Math.abs(variance) * Number(item.costPrice);

      if (variance !== 0) {
        itemsWithVariance++;
        totalVarianceValue += varianceValue;

        let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
        if (variancePercentage > 20) severity = 'CRITICAL';
        else if (variancePercentage > 10) severity = 'HIGH';
        else if (variancePercentage > 5) severity = 'MEDIUM';

        varianceHeatmap.push({
          stockItemId: item.id,
          stockItemName: item.name,
          expectedStock: Number(expectedStock.toFixed(2)),
          actualStock: Number(actualStock.toFixed(2)),
          variance: Number(variance.toFixed(2)),
          variancePercentage: Number(variancePercentage.toFixed(2)),
          varianceValue: Number(varianceValue.toFixed(2)),
          severity,
        });
      }
    });

    // Sort by variance value
    varianceHeatmap.sort((a, b) => b.varianceValue - a.varianceValue);

    // Frequent variance items (placeholder - would need historical data)
    const frequentVarianceItems: Array<{
      stockItemId: string;
      stockItemName: string;
      varianceCount: number;
      totalVariance: number;
    }> = [];

    return {
      division,
      totalItems: stockItems.length,
      itemsWithVariance,
      totalVarianceValue: Number(totalVarianceValue.toFixed(2)),
      varianceHeatmap: varianceHeatmap.slice(0, 20),
      frequentVarianceItems,
    };
  }

  // ==================== STAFF PERFORMANCE ====================

  async getStaffPerformance(
    queryDto: StaffPerformanceQueryDto,
  ): Promise<StaffPerformanceDto> {
    const startDate = new Date(queryDto.startDate);
    const endDate = new Date(queryDto.endDate);
    endDate.setHours(23, 59, 59, 999);

    const shifts = await this.prisma.shift.findMany({
      where: {
        ...(queryDto.division && { division: queryDto.division }),
        openedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        transactions: {
          where: {
            isReversed: false,
          },
        },
      },
    });

    const userMetricsMap = new Map<
      string,
      {
        userName: string;
        role: string;
        shifts: number;
        revenue: number;
        transactions: number;
        variance: number;
        voids: number;
      }
    >();

    shifts.forEach((shift) => {
      const existing = userMetricsMap.get(shift.userId) || {
        userName: shift.user.name,
        role: shift.user.role,
        shifts: 0,
        revenue: 0,
        transactions: 0,
        variance: 0,
        voids: 0,
      };

      const shiftRevenue = shift.transactions.reduce(
        (sum, t) => sum + Number(t.amount),
        0,
      );

      const shiftVoids = shift.transactions.filter((t) => t.isReversed).length;

      userMetricsMap.set(shift.userId, {
        userName: existing.userName,
        role: existing.role,
        shifts: existing.shifts + 1,
        revenue: existing.revenue + shiftRevenue,
        transactions: existing.transactions + shift.transactions.length,
        variance: existing.variance + (shift.variance ? Number(shift.variance) : 0),
        voids: existing.voids + shiftVoids,
      });
    });

    const staffMetrics = Array.from(userMetricsMap.entries()).map(
      ([userId, data]) => {
        const averageRevenuePerShift = data.shifts > 0 ? data.revenue / data.shifts : 0;
        const averageTransactionsPerShift =
          data.shifts > 0 ? data.transactions / data.shifts : 0;

        // Performance score (0-100)
        // Based on: revenue (50%), low variance (30%), low voids (20%)
        const revenueScore = Math.min((data.revenue / 100000) * 50, 50);
        const varianceScore = Math.max(30 - Math.abs(data.variance) / 100, 0);
        const voidScore = Math.max(20 - data.voids, 0);
        const performanceScore = revenueScore + varianceScore + voidScore;

        return {
          userId,
          userName: data.userName,
          role: data.role,
          totalShifts: data.shifts,
          totalRevenue: Number(data.revenue.toFixed(2)),
          averageRevenuePerShift: Number(averageRevenuePerShift.toFixed(2)),
          totalTransactions: data.transactions,
          averageTransactionsPerShift: Number(averageTransactionsPerShift.toFixed(2)),
          cashVariance: Number(data.variance.toFixed(2)),
          voidCount: data.voids,
          performanceScore: Number(performanceScore.toFixed(2)),
        };
      },
    );

    staffMetrics.sort((a, b) => b.performanceScore - a.performanceScore);

    const topPerformers = staffMetrics.slice(0, 5).map((staff) => ({
      userId: staff.userId,
      userName: staff.userName,
      totalRevenue: staff.totalRevenue,
    }));

    return {
      division: queryDto.division,
      startDate: new Date(queryDto.startDate),
      endDate: new Date(queryDto.endDate),
      staffMetrics,
      topPerformers,
    };
  }

  // ==================== REVENUE FORECAST ====================

  async getRevenueForecast(
    queryDto: RevenueForecastQueryDto,
  ): Promise<RevenueForecastDto> {
    const daysToForecast = queryDto.daysToForecast || 7;

    // Get last 30 days of historical data
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const transactions = await this.prisma.transaction.findMany({
      where: {
        division: queryDto.division,
        isReversed: false,
        createdAt: {
          gte: thirtyDaysAgo,
        },
      },
    });

    // Daily revenue
    const dailyMap = new Map<string, number>();
    transactions.forEach((t) => {
      const dateKey = t.createdAt.toISOString().split('T')[0];
      const existing = dailyMap.get(dateKey) || 0;
      dailyMap.set(dateKey, existing + Number(t.amount));
    });

    const historicalData = Array.from(dailyMap.entries())
      .map(([dateStr, revenue]) => ({
        date: new Date(dateStr),
        revenue: Number(revenue.toFixed(2)),
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    // Calculate average and trend
    const revenues = historicalData.map((d) => d.revenue);
    const averageDailyRevenue =
      revenues.length > 0
        ? revenues.reduce((sum, r) => sum + r, 0) / revenues.length
        : 0;

    // Simple linear regression for trend
    let trend: 'INCREASING' | 'STABLE' | 'DECREASING' = 'STABLE';
    if (revenues.length >= 2) {
      const firstHalf = revenues.slice(0, Math.floor(revenues.length / 2));
      const secondHalf = revenues.slice(Math.floor(revenues.length / 2));

      const firstAvg =
        firstHalf.reduce((sum, r) => sum + r, 0) / firstHalf.length;
      const secondAvg =
        secondHalf.reduce((sum, r) => sum + r, 0) / secondHalf.length;

      if (secondAvg > firstAvg * 1.1) trend = 'INCREASING';
      else if (secondAvg < firstAvg * 0.9) trend = 'DECREASING';
    }

    // Generate forecast
    const forecast: Array<{
      date: Date;
      predictedRevenue: number;
      confidence: 'LOW' | 'MEDIUM' | 'HIGH';
    }> = [];

    const trendMultiplier = trend === 'INCREASING' ? 1.05 : trend === 'DECREASING' ? 0.95 : 1;

    for (let i = 1; i <= daysToForecast; i++) {
      const forecastDate = new Date();
      forecastDate.setDate(forecastDate.getDate() + i);

      const predictedRevenue = averageDailyRevenue * Math.pow(trendMultiplier, i);

      let confidence: 'LOW' | 'MEDIUM' | 'HIGH' = 'HIGH';
      if (i > 3) confidence = 'MEDIUM';
      if (i > 5) confidence = 'LOW';

      forecast.push({
        date: forecastDate,
        predictedRevenue: Number(predictedRevenue.toFixed(2)),
        confidence,
      });
    }

    const projectedWeeklyRevenue = forecast
      .slice(0, 7)
      .reduce((sum, f) => sum + f.predictedRevenue, 0);

    return {
      division: queryDto.division,
      historicalData,
      forecast,
      trend,
      averageDailyRevenue: Number(averageDailyRevenue.toFixed(2)),
      projectedWeeklyRevenue: Number(projectedWeeklyRevenue.toFixed(2)),
    };
  }

  // ==================== PRODUCT ANALYTICS ====================

  async getProductAnalytics(
    queryDto: ProductAnalyticsQueryDto,
  ): Promise<ProductAnalyticsDto> {
    const startDate = new Date(queryDto.startDate);
    const endDate = new Date(queryDto.endDate);
    endDate.setHours(23, 59, 59, 999);

    const topN = queryDto.topN || 20;
    const daysDiff = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );

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
            product: {
              include: {
                stockItem: true,
              },
            },
          },
        },
      },
    });

    // Product performance
    const productMap = new Map<
      string,
      {
        name: string;
        category: string;
        quantity: number;
        revenue: number;
        cost: number;
      }
    >();

    transactions.forEach((t) => {
      t.lineItems.forEach((item) => {
        const existing = productMap.get(item.productId) || {
          name: item.product.name,
          category: item.product.category,
          quantity: 0,
          revenue: 0,
          cost: 0,
        };

        const itemCost = item.product.stockItem
          ? Number(item.product.stockItem.costPrice) * Number(item.quantity)
          : Number(item.product.costPrice) * Number(item.quantity);

        productMap.set(item.productId, {
          name: existing.name,
          category: existing.category,
          quantity: existing.quantity + Number(item.quantity),
          revenue: existing.revenue + Number(item.lineTotal),
          cost: existing.cost + itemCost,
        });
      });
    });

    const productPerformance = Array.from(productMap.entries())
      .map(([productId, data]) => {
        const profit = data.revenue - data.cost;
        const profitMargin = data.revenue > 0 ? (profit / data.revenue) * 100 : 0;
        const salesVelocity = daysDiff > 0 ? data.quantity / daysDiff : 0;

        let trend: 'TRENDING_UP' | 'STEADY' | 'TRENDING_DOWN' = 'STEADY';
        // Simplified trend logic
        if (salesVelocity > 10) trend = 'TRENDING_UP';
        else if (salesVelocity < 1) trend = 'TRENDING_DOWN';

        return {
          productId,
          productName: data.name,
          category: data.category,
          quantitySold: Number(data.quantity.toFixed(2)),
          revenue: Number(data.revenue.toFixed(2)),
          profit: Number(profit.toFixed(2)),
          profitMargin: Number(profitMargin.toFixed(2)),
          salesVelocity: Number(salesVelocity.toFixed(2)),
          trend,
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, topN);

    // Category performance
    const categoryMap = new Map<
      string,
      { revenue: number; profit: number; quantity: number }
    >();

    productMap.forEach((data) => {
      const existing = categoryMap.get(data.category) || {
        revenue: 0,
        profit: 0,
        quantity: 0,
      };
      const profit = data.revenue - data.cost;

      categoryMap.set(data.category, {
        revenue: existing.revenue + data.revenue,
        profit: existing.profit + profit,
        quantity: existing.quantity + data.quantity,
      });
    });

    const categoryPerformance = Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        revenue: Number(data.revenue.toFixed(2)),
        profit: Number(data.profit.toFixed(2)),
        itemsSold: Number(data.quantity.toFixed(2)),
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // Slow moving products (placeholder)
    const slowMovingProducts: Array<{
      productId: string;
      productName: string;
      daysSinceLastSale: number;
      currentStock: number;
    }> = [];

    return {
      division: queryDto.division,
      startDate: new Date(queryDto.startDate),
      endDate: new Date(queryDto.endDate),
      totalProducts: productMap.size,
      productPerformance,
      categoryPerformance,
      slowMovingProducts,
    };
  }

  // ==================== DIVISION COMPARISON ====================

  async getDivisionComparison(
    queryDto: DivisionComparisonQueryDto,
  ): Promise<DivisionComparisonDto> {
    const startDate = new Date(queryDto.startDate);
    const endDate = new Date(queryDto.endDate);
    endDate.setHours(23, 59, 59, 999);

    const divisions = Object.values(Division);
    const divisionStats: Array<{
      division: Division;
      revenue: number;
      transactions: number;
      averageTransactionValue: number;
      profitMargin: number;
      cashVariance: number;
      mpesaDiscrepancy: number;
      alertCount: number;
    }> = [];

    for (const division of divisions) {
      const transactions = await this.prisma.transaction.findMany({
        where: {
          division,
          isReversed: false,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
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

      const revenue = transactions.reduce((sum, t) => sum + Number(t.amount), 0);
      const transactionCount = transactions.length;
      const averageTransactionValue =
        transactionCount > 0 ? revenue / transactionCount : 0;

      // Calculate profit margin
      let totalCost = 0;
      transactions.forEach((t) => {
        t.lineItems.forEach((item) => {
          const cost = item.product.stockItem
            ? Number(item.product.stockItem.costPrice) * Number(item.quantity)
            : Number(item.product.costPrice) * Number(item.quantity);
          totalCost += cost;
        });
      });

      const profit = revenue - totalCost;
      const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;

      // Get alerts
      const alerts = await this.prisma.alert.findMany({
        where: {
          division,
          raisedAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      });

      divisionStats.push({
        division,
        revenue: Number(revenue.toFixed(2)),
        transactions: transactionCount,
        averageTransactionValue: Number(averageTransactionValue.toFixed(2)),
        profitMargin: Number(profitMargin.toFixed(2)),
        cashVariance: 0, // Placeholder
        mpesaDiscrepancy: 0, // Placeholder
        alertCount: alerts.length,
      });
    }

    // Find best performing
    const bestByRevenue = divisionStats.reduce((best, current) =>
      current.revenue > best.revenue ? current : best,
    );

    return {
      startDate: new Date(queryDto.startDate),
      endDate: new Date(queryDto.endDate),
      divisions: divisionStats,
      bestPerforming: {
        division: bestByRevenue.division,
        metric: 'revenue',
        value: bestByRevenue.revenue,
      },
    };
  }
}