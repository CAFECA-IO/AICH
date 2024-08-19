import { IsString } from 'class-validator';

export class ImagePostInvoiceDto {
  @IsString()
  imageName: string;
}
