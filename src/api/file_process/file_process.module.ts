// file.module.ts
import { Module } from '@nestjs/common';
import { FileProcessService } from '@/api/file_process/file_process.service';

@Module({
  providers: [FileProcessService],
  exports: [FileProcessService],
})
export class FileProcessModule {}
