import { UPLOAD_IMAGE_FOLDERS_TO_CREATE_WHEN_START_SERVER } from '@/constants/file';
import { Injectable, Logger } from '@nestjs/common';
import { OnApplicationBootstrap } from '@nestjs/common';
import { promises as fs } from 'fs';
@Injectable()
export class BeforeAppStartService implements OnApplicationBootstrap {
  private readonly logger;
  constructor() {
    this.logger = new Logger(BeforeAppStartService.name);
    this.logger.log('BeforeAppStartService initialized');
  }
  private async createFolder() {
    UPLOAD_IMAGE_FOLDERS_TO_CREATE_WHEN_START_SERVER.map(async (folder) => {
      try {
        await fs.mkdir(folder, { recursive: true });
        this.logger.log(`Folder ${folder} created.`);
      } catch (error) {
        this.logger.error(`Error while creating folder: ${error}`);
      }
    });
  }

  public async onApplicationBootstrap() {
    await this.createFolder();
  }
}
