import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProductsModule } from './products/products.module';
import { InventoryModule } from './inventory/inventory.module';
import { OrdersModule } from './orders/orders.module';
import { KitchenModule } from './kitchen/kitchen.module';
import { FinanceModule } from './finance/finance.module';
import { QueriesReportsModule } from './queries-reports/queries-reports.module';

@Module({
  imports: [AuthModule, UsersModule, ProductsModule, InventoryModule, OrdersModule, KitchenModule, FinanceModule, QueriesReportsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
