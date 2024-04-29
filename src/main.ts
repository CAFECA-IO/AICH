import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { VersioningType } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

  await app.listen(3000);
}
bootstrap();