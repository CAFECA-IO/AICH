import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, VersioningType } from '@nestjs/common';
import configration from './constants/configs/configration';
async function bootstrap() {
  const port = configration().port;
  const app = await NestFactory.create(AppModule, {
    // Info Murky (20240429): Set the logger level for the application.
    // Usage: logger.error('Error message');
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // Info Murky (20240429): Set the global prefix for the API.
  // Url will be accessible at uri/api/...
  app.setGlobalPrefix('api');

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

  await app.listen(port);
}
bootstrap();
