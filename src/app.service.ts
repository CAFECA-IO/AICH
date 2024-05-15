import { Injectable } from '@nestjs/common';
import { version } from '@/common/utils/version';

@Injectable()
export class AppService {
  getHello(): string {
    return `AICH Version ${version}`;
  }
}
