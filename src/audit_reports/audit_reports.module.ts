import { Module } from '@nestjs/common';
import { AuditReportsService } from './audit_reports.service';
import { AuditReportsController } from './audit_reports.controller';
import { LruCacheModule } from 'src/lru_cache/lru_cache.module';

@Module({
  imports: [
    LruCacheModule.forRoot({
      capacity: 10,
      idLength: 10,
    }),
  ],
  providers: [AuditReportsService],
  controllers: [AuditReportsController],
})
export class AuditReportsModule {}
