import { Test, TestingModule } from '@nestjs/testing';
import { AuditReportsService } from '@/audit_reports/audit_reports.service';

describe('AuditReportsService', () => {
  let service: AuditReportsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditReportsService],
    }).compile();

    service = module.get<AuditReportsService>(AuditReportsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
