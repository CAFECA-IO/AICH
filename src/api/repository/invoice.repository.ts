import { Injectable } from '@nestjs/common';
import { IAIInvoice } from '@/interfaces/invoice';
import { getTimestampNow } from '@/libs/utils/common';
import { PrismaService } from '@/api/prisma/prisma.service';

@Injectable()
export class InvoiceRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async create(data: IAIInvoice) {
    const now = getTimestampNow();
    const invoiceInDB = {
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    const aiInvoice = await this.prismaService.aiInvoice.create({
      data: invoiceInDB,
    });
    return aiInvoice;
  }

  async list() {
    return this.prismaService.aiInvoice.findMany();
  }

  async getById(id: number) {
    return this.prismaService.aiInvoice.findUnique({ where: { id } });
  }
}