import { Injectable } from '@nestjs/common';
import { ImagePostGeminiDto } from '@/api/gemini/dto/image_post_gemini.dto';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
@Injectable()
export class GeminiService {
  private readonly geminiApiKey: string;
  private readonly genAi: GoogleGenerativeAI;
  private readonly logger = new Logger(GeminiService.name);

  constructor(private configService: ConfigService) {
    this.geminiApiKey = this.configService.get<string>('GOOGLE_GEMINI_API_KEY');
    this.genAi = new GoogleGenerativeAI(this.geminiApiKey);
    this.logger.log('GeminiService initialized');
  }
  uploadImageToGemini(
    image: Express.Multer.File,
    imagePostGeminiDto: ImagePostGeminiDto,
  ) {
    console.log(JSON.stringify(imagePostGeminiDto));
    return 'This action adds a new gemini';
  }
}
