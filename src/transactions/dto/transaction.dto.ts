import {
  IsEnum,
  IsNumber,
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  Min,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Division, PaymentMethod } from '@prisma/client';

export class LineItemDto {
  @IsUUID()
  productId: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;
}

export class CreateTransactionDto {
  @IsEnum(Division)
  division: Division;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsOptional()
  @IsString()
  mpesaRef?: string;

  @IsOptional()
  @IsUUID()
  reservationId?: string; // For hotel check-in/checkout

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  lineItems: LineItemDto[];

  @IsOptional()
  @IsNumber()
  discount?: number;

  @IsOptional()
  @IsString()
  discountReason?: string;

  @IsOptional()
  @IsString()
  supervisorPin?: string; // Required for discounts
}

export class VoidTransactionDto {
  @IsString()
  reason: string;

  @IsString()
  managerPin: string;
}

export class TransactionResponseDto {
  id: string;
  division: Division;
  type: string;
  amount: number;
  paymentMethod: PaymentMethod;
  mpesaRef: string | null;
  isReversed: boolean;
  shift: {
    id: string;
  };
  user: {
    id: string;
    name: string;
  };
  lineItems: Array<{
    id: string;
    product: {
      name: string;
      sku: string;
    };
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  createdAt: Date;
}
