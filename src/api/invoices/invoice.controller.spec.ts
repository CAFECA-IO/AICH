import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceController } from '@/api/invoices/invoice.controller';
import { InvoiceService } from '@/api/invoices/invoice.service';

describe('invoiceController', () => {
  let controller: InvoiceController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvoiceController],
      providers: [InvoiceService],
    }).compile();

    controller = module.get<InvoiceController>(InvoiceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
