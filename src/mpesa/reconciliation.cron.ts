// reconciliation.cron.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MpesaService } from './mpesa.service';

@Injectable()
export class ReconciliationCron {
  private readonly logger = new Logger(ReconciliationCron.name);

  constructor(private mpesaService: MpesaService) {}

  @Cron('0 1 * * *') // Run at 1 AM daily
  async handleDailyReconciliation() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    this.logger.log(`Running daily Mpesa reconciliation for ${yesterday.toISOString().split('T')[0]}`);

    const result = await this.mpesaService.reconcile(
      { date: yesterday.toISOString().split('T')[0] },
      'SYSTEM',
    );

    this.logger.log(
      `Reconciliation complete: ${result.matchedCount} matched, ${result.unmatchedPosCount} unmatched POS, ${result.unmatchedDarajaCount} unmatched Daraja`,
    );

    // Send email/SMS if variance exceeds threshold
    if (Math.abs(result.variance) > 1000) {
      this.logger.warn(`High variance detected: KES ${result.variance}`);
      // TODO: Send notification
    }
  }
}