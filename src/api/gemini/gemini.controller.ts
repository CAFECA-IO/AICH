import { Controller, Post, Body } from '@nestjs/common';
import { GeminiService } from '@/api/gemini/gemini.service';
import { ImagePostGeminiDto } from '@/api/gemini/dto/image_post_gemini.dto';

@Controller('gemini')
export class GeminiController {
  constructor(private readonly geminiService: GeminiService) {}

  @Post()
  uploadImageToGemini(@Body() imagePostGeminiDto: ImagePostGeminiDto) {
    return this.geminiService.uploadImageToGemini(imagePostGeminiDto);
  }
}
