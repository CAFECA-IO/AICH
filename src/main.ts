import { promises as fs } from 'fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { RequestMethod, VersioningType } from '@nestjs/common';
import configration from '@/constants/configs/configration';

async function prepare(): Promise<void> {
  /* Info: (20241126 - Luphia) Prepare the environment before starting the application.
   * 1. Prepare application folder ${BASE_STORAGE_PATH}
   */
  // Info: (20241126 - Luphia) from .env DATABASE_URL
  const appFolder = process.env.BASE_STORAGE_PATH;

  // Info: (20241126 - Luphia) use fs promisify to create folder
  try {
    await fs.mkdir(appFolder, { recursive: true });
  } catch (e) {
    // Info: (20241126 - Luphia) if error, prepare to die
  }
}

async function bootstrap() {
  await prepare();
  const port = configration().port;
  const app = await NestFactory.create(AppModule, {
    // Info Murky (20240429): Set the logger level for the application.
    // Usage: logger.error('Error message');
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // Info Murky (20240429): Set the global prefix for the API.
  // Url will be accessible at uri/api/...
  app.setGlobalPrefix('api', {
    exclude: [{ path: '', method: RequestMethod.GET }],
  });

  /* Info Murky (20240429): Enable versioning for the API.
   * How to use:
   * add @Version('1') to the controller decorator
   * , so the api will be accessible at uri/api/v1/...
   * default is v1, if no decoration is used
   */
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: ['1'],
  });
  app.enableCors();

  await app.listen(port);
}
bootstrap();
