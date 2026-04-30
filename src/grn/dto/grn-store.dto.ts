import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsUUID,
  IsArray,
  ValidateNested,
  Min,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Division } from '@prisma/client';

// ==================== SUPPLIER DTOs ====================

export class CreateSupplierDto {
  @IsString()
  name: string;

  @IsString()
  category: string; // Liquor, Food, General, etc.

  @IsOptional()
  @IsString()
  contact?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;
}

export class UpdateSupplierDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  contact?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;
}

export class SupplierResponseDto {
  id: string;
  name: string;
  category: string;
  contact?: string;
  email?: string;
  address?: string;
  totalGrns?: number;
  totalValue?: number;
}

// ==================== GRN LINE ITEM DTOs ====================

export class GrnLineItemDto {
  @IsUUID()
  stockItemId: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitCost: number;
}

export class GrnLineItemResponseDto {
  id: string;
  stockItem: {
    id: string;
    name: string;
    sku: string;
    unit: string;
  };
  quantity: number;
  unitCost: number;
  lineTotal: number;
}

// ==================== GRN DTOs ====================

export class CreateGrnDto {
  @IsUUID()
  supplierId: string;

  @IsOptional()
  @IsString()
  invoiceRef?: string;

  @IsDateString()
  deliveryDate: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GrnLineItemDto)
  lineItems: GrnLineItemDto[];
}

export class UpdateGrnDto {
  @IsOptional()
  @IsString()
  invoiceRef?: string;

  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @IsOptional()
  @IsString()
  status?: string; // PENDING, APPROVED, REJECTED
}

export class GrnResponseDto {
  id: string;
  grnNumber: string;
  supplier: {
    id: string;
    name: string;
    category: string;
  };
  invoiceRef?: string;
  deliveryDate: Date;
  totalValue: number;
  receivedBy: string;
  approvedBy?: string;
  status: string;
  lineItems: GrnLineItemResponseDto[];
  createdAt: Date;
}

export class ApproveGrnDto {
  @IsString()
  approverPin: string;

}

export class RejectGrnDto {
  @IsString()
  reason: string;

  @IsString()
  managerPin: string;
}

// ==================== STORE ISSUE (TRANSFER) DTOs ====================

export class StoreIssueItemDto {
  @IsUUID()
  stockItemId: string;

  @IsNumber()
  @Min(0)
  quantityRequested: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantityIssued?: number;
}

export class CreateStoreIssueDto {
  @IsEnum(Division)
  fromDivision: Division;

  @IsEnum(Division)
  toDivision: Division;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StoreIssueItemDto)
  items: StoreIssueItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ApproveStoreIssueDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StoreIssueItemDto)
  items: StoreIssueItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class StoreIssueResponseDto {
  id: string;
  issueNumber: string;
  fromDivision: Division;
  toDivision: Division;
  items: Array<{
    stockItemId: string;
    stockItemName: string;
    quantityRequested: number;
    quantityIssued?: number;
    unit: string;
  }>;
  issuedBy?: string;
  receivedBy?: string;
  status: string; // PENDING, APPROVED, REJECTED, RECEIVED
  notes?: string;
  createdAt: Date;
}

// ==================== STOCK VALUATION DTOs ====================

export class StockValuationDto {
  division: Division;
  totalItems: number;
  totalValue: number;
  items: Array<{
    stockItemId: string;
    name: string;
    currentStock: number;
    unitCost: number;
    totalValue: number;
  }>;
  generatedAt: Date;
}

// ==================== SUPPLIER PERFORMANCE DTOs ====================

export class SupplierPerformanceDto {
  supplierId: string;
  supplierName: string;
  totalGrns: number;
  totalValue: number;
  averageDeliveryValue: number;
  lastDeliveryDate?: Date;
  pendingGrns: number;
  approvedGrns: number;
  rejectedGrns: number;
}
