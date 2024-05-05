import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AuditReportsService {
  private readonly logger = new Logger(AuditReportsService.name);

  constructor() {
    this.logger.log('AuditReportsService initialized');
  }
}
