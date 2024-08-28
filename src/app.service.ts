import { Injectable } from '@nestjs/common';
import { version } from '@/libs/utils/version';

@Injectable()
export class AppService {
  getVersion(): string {
    return `AICH Version ${version}`;
  }
}
