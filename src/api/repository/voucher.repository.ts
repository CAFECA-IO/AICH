import { Injectable } from '@nestjs/common';
import { IAIVoucher } from '@/interfaces/voucher';
import { getTimestampNow } from '@/libs/utils/common';
import { PrismaService } from '@/api/prisma/prisma.service';

@Injectable()
export class VoucherRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async create(data: IAIVoucher) {
    const { lineItems, ...rest } = data;
    const now = getTimestampNow();
    const aiVoucher = await this.prismaService.aiVoucher.create({
      data: {
        ...rest,
        createdAt: now,
        updatedAt: now,
        lineItems: {
          create: lineItems.map((lineItem) => ({
            ...lineItem,
            createdAt: now,
            updatedAt: now,
          })),
        },
      },
      include: {
        lineItems: true,
      },
    });
    return aiVoucher;
  }

  async list() {
    return this.prismaService.aiVoucher.findMany();
  }

  async getById(id: number) {
    return this.prismaService.aiVoucher.findUnique({ where: { id } });
  }
}
