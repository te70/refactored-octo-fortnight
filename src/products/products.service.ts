import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductResponseDto,
  CreateStockItemDto,
  UpdateStockItemDto,
  StockItemResponseDto,
  CreateStockMovementDto,
  StockMovementResponseDto,
  StockCountDto,
  StockCountResultDto,
  StockLevelDto,
  CreateRecipeDto,
  RecipeResponseDto,
} from './dto/products.dto';
import { Division } from '@prisma/client';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  // ==================== PRODUCTS ====================

  async createProduct(
    createProductDto: CreateProductDto,
    userId: string,
  ): Promise<ProductResponseDto> {
    // Check if SKU already exists
    const existing = await this.prisma.product.findUnique({
      where: { sku: createProductDto.sku },
    });

    if (existing) {
      throw new ConflictException(
        `Product with SKU ${createProductDto.sku} already exists`,
      );
    }

    // Verify stockItemId exists if provided
    if (createProductDto.stockItemId) {
      const stockItem = await this.prisma.stockItem.findUnique({
        where: { id: createProductDto.stockItemId },
      });

      if (!stockItem) {
        throw new NotFoundException('Stock item not found');
      }

      // Verify the stock item is in the same division
      if (stockItem.division !== createProductDto.division) {
        throw new BadRequestException(
          'Stock item must be in the same division as the product',
        );
      }
    }

    const product = await this.prisma.product.create({
      data: createProductDto,
      include: {
        stockItem: true,
      },
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'CREATE',
        tableName: 'products',
        recordId: product.id,
        afterJson: {
          name: product.name,
          sku: product.sku,
          unitPrice: product.unitPrice.toString(),
          costPrice: product.costPrice.toString(),
        },
      },
    });

    return this.formatProductResponse(product);
  }

  async getAllProducts(division?: Division): Promise<ProductResponseDto[]> {
    const products = await this.prisma.product.findMany({
      where: {
        ...(division && { division }),
        isActive: true,
      },
      include: {
        stockItem: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return products.map((p) => this.formatProductResponse(p));
  }

  async getProductById(id: string): Promise<ProductResponseDto> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        stockItem: true,
        recipes: {
          include: {
            ingredient: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.formatProductResponse(product);
  }

  async updateProduct(
    id: string,
    updateProductDto: UpdateProductDto,
    userId: string,
  ): Promise<ProductResponseDto> {
    const existing = await this.prisma.product.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    // If updating stockItemId, verify it exists
    if (updateProductDto.stockItemId) {
      const stockItem = await this.prisma.stockItem.findUnique({
        where: { id: updateProductDto.stockItemId },
      });

      if (!stockItem) {
        throw new NotFoundException('Stock item not found');
      }
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: updateProductDto,
      include: {
        stockItem: true,
      },
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'UPDATE',
        tableName: 'products',
        recordId: id,
        beforeJson: {
          unitPrice: existing.unitPrice.toString(),
          costPrice: existing.costPrice.toString(),
          isActive: existing.isActive,
        },
        afterJson: {
          unitPrice: updated.unitPrice.toString(),
          costPrice: updated.costPrice.toString(),
          isActive: updated.isActive,
        },
      },
    });

    return this.formatProductResponse(updated);
  }

  async deleteProduct(id: string, userId: string): Promise<ProductResponseDto> {
    const product = await this.prisma.product.findUnique({ where: { id } });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Soft delete by marking as inactive
    const deleted = await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
      include: {
        stockItem: true,
      },
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'DELETE',
        tableName: 'products',
        recordId: id,
        beforeJson: { isActive: true },
        afterJson: { isActive: false },
      },
    });

    return this.formatProductResponse(deleted);
  }

  // ==================== STOCK ITEMS ====================

  async createStockItem(
    createStockItemDto: CreateStockItemDto,
    userId: string,
  ): Promise<StockItemResponseDto> {
    const existing = await this.prisma.stockItem.findUnique({
      where: { sku: createStockItemDto.sku },
    });

    if (existing) {
      throw new ConflictException(
        `Stock item with SKU ${createStockItemDto.sku} already exists`,
      );
    }

    const stockItem = await this.prisma.stockItem.create({
      data: createStockItemDto,
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'CREATE',
        tableName: 'stock_items',
        recordId: stockItem.id,
        afterJson: {
          name: stockItem.name,
          sku: stockItem.sku,
          division: stockItem.division,
          reorderLevel: stockItem.reorderLevel.toString(),
        },
      },
    });

    return this.formatStockItemResponse(stockItem);
  }

  async getAllStockItems(division?: Division): Promise<StockItemResponseDto[]> {
    const stockItems = await this.prisma.stockItem.findMany({
      where: {
        ...(division && { division }),
      },
      orderBy: {
        name: 'asc',
      },
    });

    return stockItems.map((item) => this.formatStockItemResponse(item));
  }

  async getStockItemById(id: string): Promise<StockItemResponseDto> {
    const stockItem = await this.prisma.stockItem.findUnique({
      where: { id },
      include: {
        movements: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 50,
        },
      },
    });

    if (!stockItem) {
      throw new NotFoundException('Stock item not found');
    }

    // Calculate current stock from movements
    const currentStock = stockItem.movements.reduce((sum, movement) => {
      return sum + Number(movement.quantity);
    }, 0);

    return {
      ...this.formatStockItemResponse(stockItem),
      currentStock,
      stockValue: currentStock * Number(stockItem.costPrice),
      isLowStock: currentStock <= Number(stockItem.reorderLevel),
    };
  }

  async updateStockItem(
    id: string,
    updateStockItemDto: UpdateStockItemDto,
    userId: string,
  ): Promise<StockItemResponseDto> {
    const existing = await this.prisma.stockItem.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Stock item not found');
    }

    const updated = await this.prisma.stockItem.update({
      where: { id },
      data: updateStockItemDto,
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'UPDATE',
        tableName: 'stock_items',
        recordId: id,
        beforeJson: {
          costPrice: existing.costPrice.toString(),
          reorderLevel: existing.reorderLevel.toString(),
        },
        afterJson: {
          costPrice: updated.costPrice.toString(),
          reorderLevel: updated.reorderLevel.toString(),
        },
      },
    });

    return this.formatStockItemResponse(updated);
  }

  // ==================== STOCK MOVEMENTS ====================

  async recordStockMovement(
    stockMovementDto: CreateStockMovementDto,
    userId: string,
  ): Promise<StockMovementResponseDto> {
    const stockItem = await this.prisma.stockItem.findUnique({
      where: { id: stockMovementDto.stockItemId },
    });

    if (!stockItem) {
      throw new NotFoundException('Stock item not found');
    }

    // Verify division matches
    if (stockItem.division !== stockMovementDto.division) {
      throw new BadRequestException('Stock item division does not match movement division');
    }

    const movement = await this.prisma.stockMovement.create({
      data: {
        ...stockMovementDto,
        createdBy: userId,
      },
      include: {
        stockItem: true,
      },
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'STOCK_MOVEMENT',
        tableName: 'stock_movements',
        recordId: movement.id,
        afterJson: {
          stockItemId: stockMovementDto.stockItemId,
          movementType: stockMovementDto.movementType,
          quantity: stockMovementDto.quantity.toString(),
        },
      },
    });

    return this.formatStockMovementResponse(movement);
  }

  async getStockMovements(
    stockItemId?: string,
    division?: Division,
    startDate?: Date,
    endDate?: Date,
  ): Promise<StockMovementResponseDto[]> {
    const movements = await this.prisma.stockMovement.findMany({
      where: {
        ...(stockItemId && { stockItemId }),
        ...(division && { division }),
        ...(startDate &&
          endDate && {
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          }),
      },
      include: {
        stockItem: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 200,
    });

    return movements.map((m) => this.formatStockMovementResponse(m));
  }

  // ==================== STOCK COUNT & VARIANCE ====================

  async performStockCount(
    stockCountDto: StockCountDto,
    userId: string,
  ): Promise<StockCountResultDto> {
    const stockItem = await this.prisma.stockItem.findUnique({
      where: { id: stockCountDto.stockItemId },
    });

    if (!stockItem) {
      throw new NotFoundException('Stock item not found');
    }

    // Calculate theoretical stock from all movements
    const movements = await this.prisma.stockMovement.findMany({
      where: {
        stockItemId: stockCountDto.stockItemId,
      },
    });

    const theoreticalStock = movements.reduce((sum, movement) => {
      return sum + Number(movement.quantity);
    }, 0);

    const variance = stockCountDto.actualCount - theoreticalStock;
    const variancePercent =
      theoreticalStock !== 0 ? (variance / theoreticalStock) * 100 : 0;

    let adjustmentCreated = false;
    let alertCreated = false;

    // Record adjustment if there's a variance
    if (variance !== 0) {
      await this.prisma.stockMovement.create({
        data: {
          stockItemId: stockCountDto.stockItemId,
          division: stockItem.division,
          movementType: 'ADJUSTMENT',
          quantity: variance,
          notes: `Stock count adjustment: ${stockCountDto.notes || 'Physical count'}. Theoretical: ${theoreticalStock}, Actual: ${stockCountDto.actualCount}`,
          createdBy: userId,
        },
      });
      adjustmentCreated = true;

      // Create alert if variance is significant (> 5%)
      if (Math.abs(variancePercent) > 5) {
        await this.prisma.alert.create({
          data: {
            type: 'STOCK_VARIANCE',
            severity: Math.abs(variancePercent) > 10 ? 'CRITICAL' : 'WARNING',
            division: stockItem.division,
            description: `Stock variance for ${stockItem.name}: Expected ${theoreticalStock.toFixed(2)} ${stockItem.unit}, Counted ${stockCountDto.actualCount} ${stockItem.unit}, Variance ${variance.toFixed(2)} ${stockItem.unit} (${variancePercent.toFixed(2)}%)`,
          },
        });
        alertCreated = true;
      }

      // Audit log
      await this.prisma.auditLog.create({
        data: {
          userId,
          action: 'STOCK_COUNT',
          tableName: 'stock_items',
          recordId: stockItem.id,
          afterJson: {
            theoreticalStock: theoreticalStock.toString(),
            actualCount: stockCountDto.actualCount.toString(),
            variance: variance.toString(),
            variancePercent: variancePercent.toFixed(2),
          },
        },
      });
    }

    return {
      stockItem: {
        id: stockItem.id,
        name: stockItem.name,
        sku: stockItem.sku,
        division: stockItem.division,
      },
      theoreticalStock: Number(theoreticalStock.toFixed(2)),
      actualCount: stockCountDto.actualCount,
      variance: Number(variance.toFixed(2)),
      variancePercent: Number(variancePercent.toFixed(2)),
      adjustmentCreated,
      alertCreated,
    };
  }

  // ==================== CURRENT STOCK LEVELS ====================

  async getCurrentStockLevels(division?: Division): Promise<StockLevelDto[]> {
    const stockItems = await this.prisma.stockItem.findMany({
      where: {
        ...(division && { division }),
      },
      include: {
        movements: true,
      },
    });

    return stockItems.map((item) => {
      const currentStock = item.movements.reduce((sum, movement) => {
        return sum + Number(movement.quantity);
      }, 0);

      const isLowStock = currentStock <= Number(item.reorderLevel);

      // Calculate average daily usage (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentSales = item.movements.filter(
        (m) =>
          m.movementType === 'SALE' &&
          m.createdAt >= thirtyDaysAgo &&
          Number(m.quantity) < 0,
      );

      const totalUsage = Math.abs(
        recentSales.reduce((sum, m) => sum + Number(m.quantity), 0),
      );
      const avgDailyUsage = totalUsage / 30;

      const daysUntilStockout =
        avgDailyUsage > 0 ? Math.floor(currentStock / avgDailyUsage) : undefined;

      return {
        id: item.id,
        name: item.name,
        sku: item.sku,
        division: item.division,
        category: item.category,
        unit: item.unit,
        currentStock: Number(currentStock.toFixed(2)),
        reorderLevel: Number(item.reorderLevel),
        costPrice: Number(item.costPrice),
        stockValue: Number((currentStock * Number(item.costPrice)).toFixed(2)),
        isLowStock,
        daysUntilStockout,
      };
    });
  }

  // ==================== RECIPES ====================

  async createRecipe(
    createRecipeDto: CreateRecipeDto,
    userId: string,
  ): Promise<RecipeResponseDto> {
    // Verify product exists
    const product = await this.prisma.product.findUnique({
      where: { id: createRecipeDto.productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Verify ingredient (stock item) exists
    const ingredient = await this.prisma.stockItem.findUnique({
      where: { id: createRecipeDto.ingredientId },
    });

    if (!ingredient) {
      throw new NotFoundException('Ingredient not found');
    }

    // Verify they're in the same division
    if (product.division !== ingredient.division) {
      throw new BadRequestException('Product and ingredient must be in the same division');
    }

    const recipe = await this.prisma.recipe.create({
      data: createRecipeDto,
      include: {
        product: true,
        ingredient: true,
      },
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'CREATE',
        tableName: 'recipes',
        recordId: recipe.id,
        afterJson: {
          productId: createRecipeDto.productId,
          ingredientId: createRecipeDto.ingredientId,
          quantity: createRecipeDto.quantity.toString(),
        },
      },
    });

    return {
      id: recipe.id,
      product: {
        id: recipe.product.id,
        name: recipe.product.name,
      },
      ingredient: {
        id: recipe.ingredient.id,
        name: recipe.ingredient.name,
        unit: recipe.ingredient.unit,
      },
      quantity: Number(recipe.quantity),
    };
  }

  async getRecipesByProduct(productId: string): Promise<RecipeResponseDto[]> {
    const recipes = await this.prisma.recipe.findMany({
      where: { productId },
      include: {
        product: true,
        ingredient: true,
      },
    });

    return recipes.map((r) => ({
      id: r.id,
      product: {
        id: r.product.id,
        name: r.product.name,
      },
      ingredient: {
        id: r.ingredient.id,
        name: r.ingredient.name,
        unit: r.ingredient.unit,
      },
      quantity: Number(r.quantity),
    }));
  }

  async deleteRecipe(id: string, userId: string): Promise<void> {
    const recipe = await this.prisma.recipe.findUnique({ where: { id } });

    if (!recipe) {
      throw new NotFoundException('Recipe not found');
    }

    await this.prisma.recipe.delete({ where: { id } });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'DELETE',
        tableName: 'recipes',
        recordId: id,
        beforeJson: {
          productId: recipe.productId,
          ingredientId: recipe.ingredientId,
        },
      },
    });
  }

  // ==================== HELPER METHODS ====================

  private formatProductResponse(product: any): ProductResponseDto {
    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      category: product.category,
      division: product.division,
      unitPrice: Number(product.unitPrice),
      costPrice: Number(product.costPrice),
      isActive: product.isActive,
      ...(product.stockItem && {
        stockItem: {
          id: product.stockItem.id,
          name: product.stockItem.name,
          sku: product.stockItem.sku,
          unit: product.stockItem.unit,
        },
      }),
      ...(product.recipes && {
        recipes: product.recipes.map((r: any) => ({
          id: r.id,
          ingredient: {
            id: r.ingredient.id,
            name: r.ingredient.name,
            unit: r.ingredient.unit,
          },
          quantity: Number(r.quantity),
        })),
      }),
    };
  }

  private formatStockItemResponse(stockItem: any): StockItemResponseDto {
    return {
      id: stockItem.id,
      name: stockItem.name,
      sku: stockItem.sku,
      category: stockItem.category,
      unit: stockItem.unit,
      costPrice: Number(stockItem.costPrice),
      reorderLevel: Number(stockItem.reorderLevel),
      division: stockItem.division,
    };
  }

  private formatStockMovementResponse(movement: any): StockMovementResponseDto {
    return {
      id: movement.id,
      stockItem: {
        id: movement.stockItem.id,
        name: movement.stockItem.name,
        sku: movement.stockItem.sku,
        unit: movement.stockItem.unit,
      },
      division: movement.division,
      movementType: movement.movementType,
      quantity: Number(movement.quantity),
      referenceId: movement.referenceId,
      referenceType: movement.referenceType,
      notes: movement.notes,
      createdBy: movement.createdBy,
      createdAt: movement.createdAt,
    };
  }
}
