import { Test, TestingModule } from '@nestjs/testing';
import { AuditReportsController } from '@/audit_reports/audit_reports.controller';

describe('AuditReportsController', () => {
  let controller: AuditReportsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditReportsController],
    }).compile();

    controller = module.get<AuditReportsController>(AuditReportsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
