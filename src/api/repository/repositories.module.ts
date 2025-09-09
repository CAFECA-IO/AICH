import { Module } from '@nestjs/common';
import { PrismaModule } from '@/api/prisma/prisma.module';
import { InvoiceRepository } from '@/api/repository/invoice.repository';
import { VoucherRepository } from '@/api/repository/voucher.repository';

@Module({
  imports: [PrismaModule],
  providers: [InvoiceRepository, VoucherRepository],
  exports: [InvoiceRepository, VoucherRepository],
})
export class RepositoriesModule {}
