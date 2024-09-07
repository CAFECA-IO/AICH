import { Module } from '@nestjs/common';
import { InvoiceService } from '@/api/invoices/invoice.service';
import { InvoiceController } from '@/api/invoices/invoice.controller';
import { ConfigModule } from '@nestjs/config';
import { LruCacheModule } from '@/libs/lru_cache/lru_cache.module';
@Module({
  imports: [
    ConfigModule,
    LruCacheModule.forRoot({
      capacity: 10,
      idLength: 10,
    }),
  ],
  controllers: [InvoiceController],
  providers: [InvoiceService],
})
export class InvoiceModule {}
