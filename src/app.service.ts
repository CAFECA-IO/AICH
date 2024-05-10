import { Injectable } from '@nestjs/common';
import { version } from 'src/common/utils/version';

@Injectable()
export class AppService {
  getHello(): string {
    return `AICH Version ${version}`;
  }
}
