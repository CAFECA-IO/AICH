import { Injectable } from '@nestjs/common';
import { ImagePostGeminiDto } from '@/api/gemini/dto/image_post_gemini.dto';
@Injectable()
export class GeminiService {
  uploadImageToGemini(imagePostGeminiDto: ImagePostGeminiDto) {
    console.log(JSON.stringify(imagePostGeminiDto));
    return 'This action adds a new gemini';
  }
}
