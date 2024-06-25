import { Test, TestingModule } from '@nestjs/testing';
import { AuditReportController } from './audit_report.controller';
import { AuditReportService } from './audit_report.service';

describe('AuditReportController', () => {
  let controller: AuditReportController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditReportController],
      providers: [AuditReportService],
    }).compile();

    controller = module.get<AuditReportController>(AuditReportController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
