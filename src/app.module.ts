import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import {ConfigModule} from "@nestjs/config";
import {PrismaModule} from "./prisma/prisma.module";
import {AuthModule} from "./auth/auth.module";
import { ShiftsModule } from './shifts/shifts.module';
import { TransactionsModule } from './transactions/transactions.module';
import {ProductsModule} from "./products/products.module";
import { MpesaModule } from './mpesa/mpesa.module'; 
import { GrnStoreModule } from './grn/grn-store.module';
import { ReportsModule } from './reports/reports.module';
import { AlertsModule } from './alerts/alerts.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, }), PrismaModule, AuthModule, ShiftsModule, TransactionsModule, ProductsModule, MpesaModule, GrnStoreModule, ReportsModule, AlertsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
