import { IsString } from 'class-validator';

export class ImagePostGeminiDto {
  @IsString()
  imageName: string;
}
