import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

import { GoogleAIFileManager } from '@google/generative-ai/server';
import { deleteTemporaryFile, saveTemporaryFile } from '@/libs/utils/file';
import { FileFolder } from '@/constants/file';
import { GEMINI_MODE, GEMINI_PROMPT } from '@/constants/gemini';

@Injectable()
export class GeminiService {
  private readonly geminiApiKey: string;
  private readonly genAI: GoogleGenerativeAI;
  private readonly fileManager: GoogleAIFileManager;
  private readonly logger;
  private readonly invoiceModel;

  constructor(private configService: ConfigService) {
    this.geminiApiKey = this.configService.get<string>('GOOGLE_GEMINI_API_KEY');
    this.genAI = new GoogleGenerativeAI(this.geminiApiKey);
    this.fileManager = new GoogleAIFileManager(this.geminiApiKey);
    this.invoiceModel = this.genAI.getGenerativeModel({
      model: GEMINI_MODE.INVOICE,
      // Set the `responseMimeType` to output JSON
      // Pass the schema object to the `responseSchema` field
      generationConfig: GEMINI_PROMPT.INVOICE,
    });

    this.logger = new Logger(GeminiService.name);
    this.logger.log('GeminiService initialized');
  }

  private async uploadImageToFileManager(image: Express.Multer.File) {
    try {
      const tmpFile = await saveTemporaryFile(FileFolder.INVOICE, image);
      const uploadResult = await this.fileManager.uploadFile(
        tmpFile.folderPath,
        {
          name: tmpFile.fileName,
          mimeType: image.mimetype,
        },
      );

      this.logger.log(
        `Uploaded file ${uploadResult.file.displayName} as: ${uploadResult.file.uri}`,
      );

      await deleteTemporaryFile(tmpFile.folderPath);

      return uploadResult;
    } catch (error) {
      this.logger.error(
        `Error in uploadImageToFileManager in gemini.service: ${error}`,
      );
    }
  }

  public async uploadImageToGemini(image: Express.Multer.File) {
    const prompt =
      "You're and professional accountant, please help me to fill in the invoice information below base on invoice image provided";
    const uploadFile = await this.uploadImageToFileManager(image);
    const result = await this.invoiceModel.generateContent([
      {
        fileData: {
          mimeType: uploadFile.file.mimeType,
          fileUri: uploadFile.file.uri,
        },
      },
      { text: prompt },
    ]);

    const invoiceFromGemini = JSON.parse(result.response.text());
    return invoiceFromGemini;
  }
}
