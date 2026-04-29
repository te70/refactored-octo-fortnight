import { IsString, IsNumber, IsEnum, IsBoolean, IsOptional, IsUUID, Min } from 'class-validator';
import { Division, StockMovementType } from '@prisma/client';

// ==================== PRODUCT DTOs ====================

export class CreateProductDto {
  @IsString()
  name: string;

  @IsString()
  sku: string;

  @IsString()
  category: string;

  @IsEnum(Division)
  division: Division;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsNumber()
  @Min(0)
  costPrice: number;

  @IsOptional()
  @IsUUID()
  stockItemId?: string;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsUUID()
  stockItemId?: string;
}

export class ProductResponseDto {
  id: string;
  name: string;
  sku: string;
  category: string;
  division: Division;
  unitPrice: number;
  costPrice: number;
  isActive: boolean;
  stockItem?: {
    id: string;
    name: string;
    sku: string;
    unit: string;
  };
  recipes?: Array<{
    id: string;
    ingredient: {
      id: string;
      name: string;
      unit: string;
    };
    quantity: number;
  }>;
}

// ==================== STOCK ITEM DTOs ====================

export class CreateStockItemDto {
  @IsString()
  name: string;

  @IsString()
  sku: string;

  @IsString()
  category: string;

  @IsString()
  unit: string; // kg, l, pcs, etc.

  @IsNumber()
  @Min(0)
  costPrice: number;

  @IsNumber()
  @Min(0)
  reorderLevel: number;

  @IsEnum(Division)
  division: Division;
}

export class UpdateStockItemDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderLevel?: number;
}

export class StockItemResponseDto {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  costPrice: number;
  reorderLevel: number;
  division: Division;
  currentStock?: number;
  stockValue?: number;
  isLowStock?: boolean;
}

// ==================== STOCK MOVEMENT DTOs ====================

export class CreateStockMovementDto {
  @IsUUID()
  stockItemId: string;

  @IsEnum(Division)
  division: Division;

  @IsEnum(StockMovementType)
  movementType: StockMovementType;

  @IsNumber()
  quantity: number; // Can be negative for deductions

  @IsOptional()
  @IsString()
  referenceId?: string; // Transaction ID, GRN ID, etc.

  @IsOptional()
  @IsString()
  referenceType?: string; // TRANSACTION, GRN, TRANSFER, etc.

  @IsOptional()
  @IsString()
  notes?: string;
}

export class StockMovementResponseDto {
  id: string;
  stockItem: {
    id: string;
    name: string;
    sku: string;
    unit: string;
  };
  division: Division;
  movementType: string;
  quantity: number;
  referenceId?: string;
  referenceType?: string;
  notes?: string;
  createdBy: string;
  createdAt: Date;
}

// ==================== STOCK COUNT DTOs ====================

export class StockCountDto {
  @IsUUID()
  stockItemId: string;

  @IsNumber()
  @Min(0)
  actualCount: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class StockCountResultDto {
  stockItem: {
    id: string;
    name: string;
    sku: string;
    division: Division;
  };
  theoreticalStock: number;
  actualCount: number;
  variance: number;
  variancePercent: number;
  adjustmentCreated: boolean;
  alertCreated: boolean;
}

// ==================== STOCK LEVEL DTOs ====================

export class StockLevelDto {
  id: string;
  name: string;
  sku: string;
  division: Division;
  category: string;
  unit: string;
  currentStock: number;
  reorderLevel: number;
  costPrice: number;
  stockValue: number;
  isLowStock: boolean;
  daysUntilStockout?: number;
}

// ==================== RECIPE DTOs ====================

export class CreateRecipeDto {
  @IsUUID()
  productId: string;

  @IsUUID()
  ingredientId: string; // StockItem ID

  @IsNumber()
  @Min(0)
  quantity: number;
}

export class RecipeResponseDto {
  id: string;
  product: {
    id: string;
    name: string;
  };
  ingredient: {
    id: string;
    name: string;
    unit: string;
  };
  quantity: number;
}
