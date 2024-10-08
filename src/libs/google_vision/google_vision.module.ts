import { Module } from '@nestjs/common';
import { GoogleVisionService } from '@/libs/google_vision/google_vision.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  // Info Murky (20240429): ConfigModule.forRoot() is used to load the environment variables from the .env file.
  imports: [ConfigModule.forRoot()],
  providers: [GoogleVisionService],
  exports: [GoogleVisionService],
})
export class GoogleVisionModule {}
