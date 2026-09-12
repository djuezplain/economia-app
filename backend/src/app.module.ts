import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DbModule } from './db/db.module.js';
import { HealthController } from './health/health.controller.js';
import { envValidationSchema } from './config/env.validation.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { TransactionsModule } from './transactions/transactions.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { ImportModule } from './import/import.module.js';
import { GoalsModule } from './goals/goals.module.js';
import { WealthModule } from './wealth/wealth.module.js';
import { DataImportModule } from './data-import/data-import.module.js';
import { GoogleDriveModule } from './google-drive/google-drive.module.js';
import { StockImportModule } from './stock-import/stock-import.module.js';
import { ReceiptImportModule } from './receipt-import/receipt-import.module.js';
import { GroceriesModule } from './groceries/groceries.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    ScheduleModule.forRoot(),
    DbModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    TransactionsModule,
    DashboardModule,
    ImportModule,
    GoalsModule,
    WealthModule,
    DataImportModule,
    GoogleDriveModule,
    StockImportModule,
    ReceiptImportModule,
    GroceriesModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
