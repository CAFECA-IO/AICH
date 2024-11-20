import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  GoogleAIFileManager,
  UploadFileResponse,
} from '@google/generative-ai/server';
import { deleteTemporaryFile, saveTemporaryFile } from '@/libs/utils/file';
import { FileFolder } from '@/constants/file';
import { GEMINI_MODE, GEMINI_PROMPT } from '@/constants/gemini';
import { LruCacheService } from '@/libs/lru_cache/lru_cache.service';
import { IInvoice } from '@/interfaces/invoice';
import { randomUUID } from 'crypto';
import { PROGRESS_STATUS } from '@/constants/common';
import { cleanInvoice } from '@/libs/utils/type_cleaner/invoice';
import { AccountResultStatus } from '@/interfaces/account';
import { ImagePostInvoiceDto } from '@/api/invoices/dto/image_post_invoice.dto';

@Injectable()
export class GeminiService {
  private readonly geminiApiKey: string;
  private readonly genAI: GoogleGenerativeAI;
  private readonly fileManager: GoogleAIFileManager;
  private readonly logger;
  private readonly geminiModel;

  constructor(
    private configService: ConfigService,
    private cache: LruCacheService<IInvoice>,
  ) {
    this.geminiApiKey = this.configService.get<string>('GOOGLE_GEMINI_API_KEY');
    this.genAI = new GoogleGenerativeAI(this.geminiApiKey);
    this.fileManager = new GoogleAIFileManager(this.geminiApiKey);
    this.geminiModel = this.genAI.getGenerativeModel({
      model: GEMINI_MODE.INVOICE,
      generationConfig: GEMINI_PROMPT.INVOICE,
    });

    this.logger = new Logger(GeminiService.name);
    this.logger.log('GeminiService initialized');
  }

  public getInvoiceStatus(resultId: string): PROGRESS_STATUS {
    let status = PROGRESS_STATUS.NOT_FOUND;
    const result = this.cache.get(resultId);

    if (result) {
      status = result.status;
    }

    return status;
  }

  public getInvoiceResult(resultId: string): IInvoice | null {
    const result = this.cache.get(resultId);
    let value = null;
    if (result && result.status === PROGRESS_STATUS.SUCCESS) {
      value = result.value;
    }

    return value;
  }

  public startGenerateInvoice(
    imagePostInvoiceDto: ImagePostInvoiceDto,
    image: Express.Multer.File,
  ): AccountResultStatus {
    const imageName = imagePostInvoiceDto.imageName || image.originalname;
    let hashedKey = this.generateHashKey(imageName);
    let result: AccountResultStatus;

    if (this.cache.get(hashedKey).value) {
      result = {
        resultId: hashedKey,
        status: PROGRESS_STATUS.ALREADY_UPLOAD,
      };
    } else {
      hashedKey = this.cache.put(hashedKey, PROGRESS_STATUS.IN_PROGRESS, null);
      this.uploadImageToInvoice(hashedKey, image);
      result = {
        resultId: hashedKey,
        status: PROGRESS_STATUS.IN_PROGRESS,
      };
    }

    return result;
  }

  private generateHashKey(fileName?: string) {
    if (!fileName) {
      fileName = randomUUID();
    }
    const hashedId = this.cache.hashIdWithTimestamp(fileName);
    return hashedId;
  }

  private async uploadImageToInvoice(
    hashedKey: string,
    image: Express.Multer.File,
  ) {
    const prompt =
      "You're a professional accountant, please help me to fill in the invoice information below based on the provided invoice image";

    let uploadFile: UploadFileResponse;

    try {
      uploadFile = await this.uploadImageToFileManager(hashedKey, image);
    } catch (error) {
      this.logger.error(
        `Invoice ID: ${hashedKey} System Error in uploadImageToInvoice in gemini.service: ${error}`,
      );
      this.cache.put(hashedKey, PROGRESS_STATUS.SYSTEM_ERROR, null);
      return;
    }

    let result: any;

    try {
      result = await this.geminiModel.generateContent([
        {
          fileData: {
            mimeType: uploadFile.file.mimeType,
            fileUri: uploadFile.file.uri,
          },
        },
        { text: prompt },
      ]);
    } catch (error) {
      this.logger.error(
        `Invoice ID: ${hashedKey} LLM Error in generateContent in gemini.service: ${error}`,
      );
      this.cache.put(hashedKey, PROGRESS_STATUS.LLM_ERROR, null);
      return;
    }

    try {
      const invoiceFromGemini = JSON.parse(result.response.text());
      const invoice: IInvoice = cleanInvoice(invoiceFromGemini);
      this.cache.put(hashedKey, PROGRESS_STATUS.SUCCESS, invoice);
    } catch (error) {
      this.logger.error(
        `Invoice ID: ${hashedKey} LLM Error in generateContent in gemini.service due to parsing gemini output failed or gemini not returning correct json: ${error}`,
      );
      this.cache.put(hashedKey, PROGRESS_STATUS.LLM_ERROR, null);
      return;
    }

    return;
  }

  private async uploadImageToFileManager(
    hashedKey: string,
    image: Express.Multer.File,
  ) {
    try {
      const tmpFile = await saveTemporaryFile(
        FileFolder.INVOICE,
        image,
        hashedKey,
      );

      const uploadResult = await this.fileManager.uploadFile(
        tmpFile.folderPath,
        {
          name: tmpFile.fileName,
          mimeType: image.mimetype,
        },
      );

      this.logger.log(
        `Uploaded file ${uploadResult.file.name} as: ${uploadResult.file.uri}`,
      );

      await deleteTemporaryFile(tmpFile.folderPath);

      return uploadResult;
    } catch (error) {
      this.logger.error(
        `Error in uploadImageToFileManager in gemini.service: ${error}`,
      );
      throw error;
    }
  }
}
