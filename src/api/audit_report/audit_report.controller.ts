import {
  Controller,
  // Get,
  Post,
  Body,
  // Patch,
  // Param,
  // Delete,
} from '@nestjs/common';
import { AuditReportService } from '@/api/audit_report/audit_report.service';
// import { CreateAuditReportDto } from './dto/create-audit_report.dto';
// import { UpdateAuditReportDto } from './dto/update-audit_report.dto';

@Controller('audit-report')
export class AuditReportController {
  constructor(private readonly auditReportService: AuditReportService) {}

  @Post()
  create(@Body() { input: input }) {
    return this.auditReportService.create(input);
  }

  // @Get()
  // findAll() {
  //   return this.auditReportService.findAll();
  // }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.auditReportService.findOne(+id);
  // }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updateAuditReportDto: UpdateAuditReportDto) {
  //   return this.auditReportService.update(+id, updateAuditReportDto);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.auditReportService.remove(+id);
  // }
}
