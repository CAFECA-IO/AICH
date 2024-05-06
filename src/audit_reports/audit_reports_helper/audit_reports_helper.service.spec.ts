import { Test, TestingModule } from '@nestjs/testing';
import { AuditReportsHelperService } from './audit_reports_helper.service';

describe('AuditReportsHelperService', () => {
  let service: AuditReportsHelperService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditReportsHelperService],
    }).compile();

    service = module.get<AuditReportsHelperService>(AuditReportsHelperService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
