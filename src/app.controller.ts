import { Controller, Get, Version, VERSION_NEUTRAL } from '@nestjs/common';
import { AppService } from '@/app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Version(VERSION_NEUTRAL) // Info: (20240828 - Murky) VERSION_NEUTRAL remove "v1" from the url
  getVersion(): string {
    return this.appService.getVersion();
  }
}
