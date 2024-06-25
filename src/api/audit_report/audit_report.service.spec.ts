import { Test, TestingModule } from '@nestjs/testing';
import { AuditReportService } from './audit_report.service';

describe('AuditReportService', () => {
  let service: AuditReportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditReportService],
    }).compile();

    service = module.get<AuditReportService>(AuditReportService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
