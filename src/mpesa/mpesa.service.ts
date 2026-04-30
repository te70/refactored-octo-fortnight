import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  StkPushDto,
  StkPushResponseDto,
  MpesaCallbackDto,
  C2BCallbackDto,
  ReconcileDto,
  ReconciliationResultDto,
  MpesaTransactionQueryDto,
  MpesaTransactionResponseDto,
  DarajaAuthResponseDto,
  StkPushRequestDto,
  StkQueryRequestDto,
  PullStatementDto,
} from './dto/mpesa.dto';
import { Division } from '@prisma/client';
import axios from 'axios';

@Injectable()
export class MpesaService {
  private readonly logger = new Logger(MpesaService.name);
  private readonly baseUrl: string;
  private readonly consumerKey: string;
  private readonly consumerSecret: string;
  private readonly shortcode: string;
  private readonly passkey: string;
  private readonly callbackUrl: string;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    // Daraja API URLs
    this.baseUrl =
      this.configService.get('MPESA_ENV') === 'production'
        ? 'https://api.safaricom.co.ke'
        : 'https://sandbox.safaricom.co.ke';

    this.consumerKey = this.configService.get('MPESA_CONSUMER_KEY') || '';
    this.consumerSecret = this.configService.get('MPESA_CONSUMER_SECRET') || '';
    this.shortcode = this.configService.get('MPESA_SHORTCODE') || '';
    this.passkey = this.configService.get('MPESA_PASSKEY') || '';
    this.callbackUrl = this.configService.get('MPESA_CALLBACK_URL') || '';
  }

  // ==================== AUTHENTICATION ====================

  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');

      const response = await axios.get<DarajaAuthResponseDto>(
        `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
        {
          headers: {
            Authorization: `Basic ${auth}`,
          },
        },
      );

      this.accessToken = response.data.access_token;
      
      // Token expires in 1 hour, refresh 5 minutes before
      const expiresIn = parseInt(response.data.expires_in) - 300;
      this.tokenExpiry = new Date(Date.now() + expiresIn * 1000);

      this.logger.log('Mpesa access token obtained successfully');
      return this.accessToken;
    } catch (error) {
      this.logger.error('Failed to get Mpesa access token', error);
      throw new BadRequestException('Failed to authenticate with Mpesa');
    }
  }

  // ==================== STK PUSH ====================

  async initiateStkPush(stkPushDto: StkPushDto, userId: string): Promise<StkPushResponseDto> {
    const token = await this.getAccessToken();
    const timestamp = this.generateTimestamp();
    const password = this.generatePassword(timestamp);

    const requestData: StkPushRequestDto = {
      BusinessShortCode: this.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: stkPushDto.amount,
      PartyA: stkPushDto.phoneNumber,
      PartyB: this.shortcode,
      PhoneNumber: stkPushDto.phoneNumber,
      CallBackURL: this.callbackUrl,
      AccountReference: stkPushDto.accountReference,
      TransactionDesc: stkPushDto.transactionDesc || 'Payment',
    };

    try {
      const response = await axios.post(
        `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
        requestData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const result: StkPushResponseDto = {
        merchantRequestID: response.data.MerchantRequestID,
        checkoutRequestID: response.data.CheckoutRequestID,
        responseCode: response.data.ResponseCode,
        responseDescription: response.data.ResponseDescription,
        customerMessage: response.data.CustomerMessage,
      };

      // Log STK push initiation
      this.logger.log(
        `STK Push initiated: ${result.checkoutRequestID} for ${stkPushDto.phoneNumber}`,
      );

      // Create pending Mpesa transaction record
      await this.prisma.mpesaTransaction.create({
        data: {
          transactionRef: result.checkoutRequestID,
          amount: stkPushDto.amount,
          msisdn: stkPushDto.phoneNumber,
          division: stkPushDto.division,
          timestamp: new Date(),
          status: 'PENDING',
        },
      });

      // Audit log
      await this.prisma.auditLog.create({
        data: {
          userId,
          action: 'STK_PUSH',
          tableName: 'mpesa_transactions',
          recordId: result.checkoutRequestID,
          afterJson: {
            amount: stkPushDto.amount.toString(),
            phoneNumber: stkPushDto.phoneNumber,
            division: stkPushDto.division,
          },
        },
      });

      return result;
    } catch (error: any) {
      this.logger.error('STK Push failed', error.response?.data || error.message);
      throw new BadRequestException(
        error.response?.data?.errorMessage || 'Failed to initiate STK Push',
      );
    }
  }

  // ==================== STK CALLBACK HANDLER ====================

  async handleStkCallback(callbackData: MpesaCallbackDto): Promise<void> {
    const callback = callbackData.Body.stkCallback;
    const checkoutRequestID = callback.CheckoutRequestID;
    const resultCode = callback.ResultCode;

    this.logger.log(`STK Callback received: ${checkoutRequestID}, Result: ${resultCode}`);

    if (resultCode === 0 && callback.CallbackMetadata) {
      // Payment successful
      const metadata = callback.CallbackMetadata.Item;
      const amount = this.extractMetadataValue(metadata, 'Amount');
      const mpesaReceiptNumber = this.extractMetadataValue(metadata, 'MpesaReceiptNumber');
      const transactionDate = this.extractMetadataValue(metadata, 'TransactionDate');
      const phoneNumber = this.extractMetadataValue(metadata, 'PhoneNumber');

      // Update Mpesa transaction
      const mpesaTransaction = await this.prisma.mpesaTransaction.findUnique({
        where: { transactionRef: checkoutRequestID },
      });

      if (mpesaTransaction) {
        await this.prisma.mpesaTransaction.update({
          where: { transactionRef: checkoutRequestID },
          data: {
            transactionRef: mpesaReceiptNumber,
            amount,
            msisdn: phoneNumber.toString(),
            timestamp: this.parseMpesaTimestamp(transactionDate),
            status: 'MATCHED', // Auto-match since STK was initiated by us
          },
        });

        this.logger.log(`STK payment successful: ${mpesaReceiptNumber}`);
      }
    } else {
      // Payment failed or cancelled
      const mpesaTransaction = await this.prisma.mpesaTransaction.findUnique({
        where: { transactionRef: checkoutRequestID },
      });

      if (mpesaTransaction) {
        await this.prisma.mpesaTransaction.delete({
          where: { transactionRef: checkoutRequestID },
        });

        this.logger.warn(
          `STK payment failed/cancelled: ${checkoutRequestID} - ${callback.ResultDesc}`,
        );
      }
    }
  }

  // ==================== C2B CALLBACK HANDLER ====================

  async handleC2BCallback(callbackData: C2BCallbackDto): Promise<void> {
    this.logger.log(`C2B Payment received: ${callbackData.TransID}`);

    try {
      // Check if transaction already exists
      const existing = await this.prisma.mpesaTransaction.findUnique({
        where: { transactionRef: callbackData.TransID },
      });

      if (existing) {
        this.logger.warn(`Duplicate C2B transaction ignored: ${callbackData.TransID}`);
        return;
      }

      // Create Mpesa transaction with UNMATCHED status
      // The reconciliation process will match it later
      await this.prisma.mpesaTransaction.create({
        data: {
          transactionRef: callbackData.TransID,
          amount: callbackData.TransAmount,
          msisdn: callbackData.MSISDN,
          division: 'HOTEL', // Default, will be updated by reconciliation
          timestamp: this.parseMpesaTransTime(callbackData.TransTime),
          status: 'UNMATCHED',
        },
      });

      // Create alert for unmatched payment
      await this.prisma.alert.create({
        data: {
          type: 'UNMATCHED_MPESA',
          severity: 'WARNING',
          division: 'HOTEL',
          description: `Unmatched Mpesa payment received: ${callbackData.TransID} - KES ${callbackData.TransAmount} from ${callbackData.MSISDN}`,
        },
      });

      this.logger.log(`C2B transaction created as UNMATCHED: ${callbackData.TransID}`);
    } catch (error) {
      this.logger.error('Failed to process C2B callback', error);
    }
  }

  // ==================== RECONCILIATION ====================

  async reconcile(reconcileDto: ReconcileDto, userId: string): Promise<ReconciliationResultDto> {
    const date = reconcileDto.date ? new Date(reconcileDto.date) : new Date();
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    this.logger.log(`Starting reconciliation for ${date.toISOString().split('T')[0]}`);

    // Get POS Mpesa transactions
    const posTransactions = await this.prisma.transaction.findMany({
      where: {
        paymentMethod: 'MPESA',
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
        ...(reconcileDto.division && { division: reconcileDto.division }),
        isReversed: false,
      },
    });

    // Get Daraja Mpesa transactions
    const darajaTransactions = await this.prisma.mpesaTransaction.findMany({
      where: {
        timestamp: {
          gte: startOfDay,
          lte: endOfDay,
        },
        ...(reconcileDto.division && { division: reconcileDto.division }),
      },
    });

    const matched: any[] = [];
    const unmatchedPos: any[] = [];
    const unmatchedDaraja: any[] = [];

    // Match by transaction reference
    for (const posTransaction of posTransactions) {
      if (!posTransaction.mpesaRef) {
        unmatchedPos.push({
          transactionId: posTransaction.id,
          mpesaRef: 'MISSING',
          amount: Number(posTransaction.amount),
          division: posTransaction.division,
          createdAt: posTransaction.createdAt,
        });
        continue;
      }

      const darajaMatch = darajaTransactions.find(
        (d) => d.transactionRef === posTransaction.mpesaRef,
      );

      if (darajaMatch) {
        // Match found
        if (darajaMatch.status !== 'MATCHED') {
          await this.prisma.mpesaTransaction.update({
            where: { id: darajaMatch.id },
            data: {
              status: 'MATCHED',
              matchedTransactionId: posTransaction.id,
            },
          });
        }

        matched.push({
          transactionRef: posTransaction.mpesaRef,
          amount: Number(posTransaction.amount),
          division: posTransaction.division,
          matchedAt: new Date(),
        });
      } else {
        // POS transaction has no Daraja match
        unmatchedPos.push({
          transactionId: posTransaction.id,
          mpesaRef: posTransaction.mpesaRef,
          amount: Number(posTransaction.amount),
          division: posTransaction.division,
          createdAt: posTransaction.createdAt,
        });
      }
    }

    // Find Daraja transactions with no POS match
    for (const darajaTransaction of darajaTransactions) {
      if (darajaTransaction.status === 'UNMATCHED') {
        unmatchedDaraja.push({
          transactionRef: darajaTransaction.transactionRef,
          amount: Number(darajaTransaction.amount),
          msisdn: darajaTransaction.msisdn,
          timestamp: darajaTransaction.timestamp,
        });
      }
    }

    // Calculate totals
    const posTotal = posTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
    const darajaTotal = darajaTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
    const variance = posTotal - darajaTotal;

    // Create alerts for significant discrepancies
    if (Math.abs(variance) > 100) {
      await this.prisma.alert.create({
        data: {
          type: 'MPESA_VARIANCE',
          severity: Math.abs(variance) > 1000 ? 'CRITICAL' : 'WARNING',
          division: reconcileDto.division || 'HOTEL',
          description: `Mpesa reconciliation variance: POS KES ${posTotal.toFixed(2)}, Daraja KES ${darajaTotal.toFixed(2)}, Variance KES ${variance.toFixed(2)}`,
        },
      });
    }

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'MPESA_RECONCILIATION',
        tableName: 'mpesa_transactions',
        recordId: date.toISOString(),
        afterJson: {
          date: date.toISOString(),
          posTotal: posTotal.toString(),
          darajaTotal: darajaTotal.toString(),
          variance: variance.toString(),
          matchedCount: matched.length,
          unmatchedPosCount: unmatchedPos.length,
          unmatchedDarajaCount: unmatchedDaraja.length,
        },
      },
    });

    this.logger.log(
      `Reconciliation complete: ${matched.length} matched, ${unmatchedPos.length} unmatched POS, ${unmatchedDaraja.length} unmatched Daraja`,
    );

    return {
      date,
      division: reconcileDto.division,
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

  // ==================== QUERY TRANSACTIONS ====================

  async getTransactions(
    queryDto: MpesaTransactionQueryDto,
  ): Promise<MpesaTransactionResponseDto[]> {
    const transactions = await this.prisma.mpesaTransaction.findMany({
      where: {
        ...(queryDto.division && { division: queryDto.division }),
        ...(queryDto.status && { status: queryDto.status }),
        ...(queryDto.startDate &&
          queryDto.endDate && {
            timestamp: {
              gte: new Date(queryDto.startDate),
              lte: new Date(queryDto.endDate),
            },
          }),
      },
      include: {
        transaction: {
          select: {
            id: true,
            type: true,
            amount: true,
          },
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: 100,
    });

    return transactions.map((t) => ({
      id: t.id,
      transactionRef: t.transactionRef,
      amount: Number(t.amount),
      msisdn: t.msisdn,
      division: t.division,
      timestamp: t.timestamp,
      status: t.status,
      ...(t.transaction && {
        matchedTransaction: {
          id: t.transaction.id,
          type: t.transaction.type,
          amount: Number(t.transaction.amount),
        },
      }),
      createdAt: t.createdAt,
    }));
  }

  // ==================== HELPER METHODS ====================

  private generateTimestamp(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  }

  private generatePassword(timestamp: string): string {
    const str = `${this.shortcode}${this.passkey}${timestamp}`;
    return Buffer.from(str).toString('base64');
  }

  private extractMetadataValue(metadata: any[], name: string): any {
    const item = metadata.find((i) => i.Name === name);
    return item ? item.Value : null;
  }

  private parseMpesaTimestamp(timestamp: number): Date {
    // Mpesa timestamp format: YYYYMMDDHHmmss
    const str = timestamp.toString();
    const year = parseInt(str.substring(0, 4));
    const month = parseInt(str.substring(4, 6)) - 1;
    const day = parseInt(str.substring(6, 8));
    const hours = parseInt(str.substring(8, 10));
    const minutes = parseInt(str.substring(10, 12));
    const seconds = parseInt(str.substring(12, 14));
    return new Date(year, month, day, hours, minutes, seconds);
  }

  private parseMpesaTransTime(transTime: string): Date {
    // TransTime format: YYYYMMDDHHmmss
    const year = parseInt(transTime.substring(0, 4));
    const month = parseInt(transTime.substring(4, 6)) - 1;
    const day = parseInt(transTime.substring(6, 8));
    const hours = parseInt(transTime.substring(8, 10));
    const minutes = parseInt(transTime.substring(10, 12));
    const seconds = parseInt(transTime.substring(12, 14));
    return new Date(year, month, day, hours, minutes, seconds);
  }
}
