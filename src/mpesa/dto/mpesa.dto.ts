import { IsString, IsNumber, IsEnum, IsOptional, Min, Matches } from 'class-validator';
import { Division } from '@prisma/client';

// ==================== STK PUSH DTOs ====================

export class StkPushDto {
  @IsString()
  @Matches(/^254\d{9}$/, { message: 'Phone number must be in format 254XXXXXXXXX' })
  phoneNumber: string;

  @IsNumber()
  @Min(1)
  amount: number;

  @IsEnum(Division)
  division: Division;

  @IsString()
  accountReference: string; // e.g., "ROOM_101", "TABLE_5", "ORDER_123"

  @IsOptional()
  @IsString()
  transactionDesc?: string;
}

export class StkPushResponseDto {
  merchantRequestID: string;
  checkoutRequestID: string;
  responseCode: string;
  responseDescription: string;
  customerMessage: string;
}

// ==================== CALLBACK DTOs ====================

export class MpesaCallbackDto {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: {
        Item: Array<{
          Name: string;
          Value: any;
        }>;
      };
    };
  };
}

export class C2BCallbackDto {
  TransactionType: string;
  TransID: string;
  TransTime: string;
  TransAmount: number;
  BusinessShortCode: string;
  BillRefNumber: string;
  InvoiceNumber?: string;
  OrgAccountBalance?: number;
  ThirdPartyTransID?: string;
  MSISDN: string;
  FirstName?: string;
  MiddleName?: string;
  LastName?: string;
}

// ==================== RECONCILIATION DTOs ====================

export class ReconcileDto {
  @IsOptional()
  @IsEnum(Division)
  division?: Division;

  @IsOptional()
  @IsString()
  date?: string; // YYYY-MM-DD format
}

export class ReconciliationResultDto {
  date: Date;
  division?: Division;
  posTotal: number;
  darajaTotal: number;
  variance: number;
  matchedCount: number;
  unmatchedPosCount: number;
  unmatchedDarajaCount: number;
  matched: Array<{
    transactionRef: string;
    amount: number;
    division: Division;
    matchedAt: Date;
  }>;
  unmatchedPos: Array<{
    transactionId: string;
    mpesaRef: string;
    amount: number;
    division: Division;
    createdAt: Date;
  }>;
  unmatchedDaraja: Array<{
    transactionRef: string;
    amount: number;
    msisdn: string;
    timestamp: Date;
  }>;
}

// ==================== TRANSACTION QUERY DTOs ====================

export class MpesaTransactionQueryDto {
  @IsOptional()
  @IsEnum(Division)
  division?: Division;

  @IsOptional()
  @IsString()
  status?: string; // MATCHED, UNMATCHED, PENDING

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

export class MpesaTransactionResponseDto {
  id: string;
  transactionRef: string;
  amount: number;
  msisdn: string;
  division: Division;
  timestamp: Date;
  status: string;
  matchedTransaction?: {
    id: string;
    type: string;
    amount: number;
  };
  createdAt: Date;
}

// ==================== DARAJA API INTERNAL DTOs ====================

export class DarajaAuthResponseDto {
  access_token: string;
  expires_in: string;
}

export class StkPushRequestDto {
  BusinessShortCode: string;
  Password: string;
  Timestamp: string;
  TransactionType: string;
  Amount: number;
  PartyA: string;
  PartyB: string;
  PhoneNumber: string;
  CallBackURL: string;
  AccountReference: string;
  TransactionDesc: string;
}

export class StkQueryRequestDto {
  BusinessShortCode: string;
  Password: string;
  Timestamp: string;
  CheckoutRequestID: string;
}

export class StkQueryResponseDto {
  ResponseCode: string;
  ResponseDescription: string;
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResultCode: string;
  ResultDesc: string;
}

// ==================== STATEMENT PULL DTOs ====================

export class MpesaStatementDto {
  transactionRef: string;
  amount: number;
  msisdn: string;
  billRefNumber: string;
  timestamp: Date;
  transactionType: string;
}

export class PullStatementDto {
  @IsString()
  startDate: string; // YYYY-MM-DD

  @IsString()
  endDate: string; // YYYY-MM-DD
}
