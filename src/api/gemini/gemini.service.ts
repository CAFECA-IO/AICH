import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
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
import { ImagePostGeminiDto } from '@/api/gemini/dto/image_post_gemini.dto';
@Injectable()
export class GeminiService {
  private readonly geminiApiKey: string;
  private readonly genAI: GoogleGenerativeAI;
  private readonly fileManager: GoogleAIFileManager;
  private readonly logger;
  private readonly invoiceModel;

  constructor(
    private configService: ConfigService,
    private cache: LruCacheService<IInvoice>,
  ) {
    this.geminiApiKey = this.configService.get<string>('GOOGLE_GEMINI_API_KEY');
    this.genAI = new GoogleGenerativeAI(this.geminiApiKey);
    this.fileManager = new GoogleAIFileManager(this.geminiApiKey);
    this.invoiceModel = this.genAI.getGenerativeModel({
      model: GEMINI_MODE.INVOICE,
      generationConfig: GEMINI_PROMPT.INVOICE,
    });

    this.logger = new Logger(GeminiService.name);
    this.logger.log('GeminiService initialized');
  }

  /**
   * Get the status of the gemini result by resultId
   * @param {string} resultId - The resultId of the gemini result
   * @returns {PROGRESS_STATUS} - The status of the gemini result
   */
  public getGeminiStatus(resultId: string): PROGRESS_STATUS {
    let status = PROGRESS_STATUS.NOT_FOUND;
    const result = this.cache.get(resultId);

    if (result) {
      status = result.status;
    }

    return status;
  }

  /**
   * Get the gemini result by resultId
   * @param {string} resultId - The resultId of the gemini result
   * @returns {IInvoice | null} - The gemini result, which is an invoice object
   */
  public getGeminiResult(resultId: string): IInvoice | null {
    const result = this.cache.get(resultId);
    let value = null;
    if (result && result.status === PROGRESS_STATUS.SUCCESS) {
      value = result.value;
    }

    return value;
  }

  /**
   * Start the process of generating invoice from the image, it will return the resultId and status of the process immediately
   * @param {Express.Multer.File} image - The image file to generate invoice from
   * @returns {{ id: string; status: PROGRESS_STATUS }} - The resultId and status of the process
   */
  public startGenerateInvoice(
    imagePostGeminiDto: ImagePostGeminiDto,
    image: Express.Multer.File,
  ): AccountResultStatus {
    // Info (20240815 - Murky): Pipe line => startGenerateInvoice => uploadImageToGemini
    const imageName = imagePostGeminiDto.imageName || image.originalname;
    let hashedKey = this.generateHashKey(imageName);
    let result: AccountResultStatus;

    // Info (20240815 - Murky): If the image is already uploaded and saved in the cache, return the status
    if (this.cache.get(hashedKey).value) {
      result = {
        resultId: hashedKey,
        status: PROGRESS_STATUS.ALREADY_UPLOAD,
      };
    } else {
      hashedKey = this.cache.put(hashedKey, PROGRESS_STATUS.IN_PROGRESS, null);

      // Info (20240815 - Murky): Pipeline start here
      this.uploadImageToGemini(hashedKey, image);

      result = {
        resultId: hashedKey,
        status: PROGRESS_STATUS.IN_PROGRESS,
      };
    }

    return result;
  }

  /**
   * Generate a hashed key for the image file, it combines the file name (or random uuid) and a combined timestamp
   * @param {string} fileName - The file name of the image
   * @returns {string} - The hashed key from fileName (or random uuid) and timestamp
   */
  private generateHashKey(fileName?: string) {
    if (!fileName) {
      fileName = randomUUID();
    }
    const hashedId = this.cache.hashIdWithTimestamp(fileName);
    return hashedId;
  }

  /**
   * save the image file to local storage and upload it to the google file manager
   * @param {string} hashedKey - The hashed key of the image file
   * @param  {Express.Multer.File} image - The image file to upload
   * @returns {Promise<UploadFileResponse>} - The UploadFileResponse of the uploaded file
   */
  private async uploadImageToGemini(
    hashedKey: string,
    image: Express.Multer.File,
  ) {
    const prompt =
      "You're and professional accountant, please help me to fill in the invoice information below base on invoice image provided";

    let uploadFile: UploadFileResponse;

    try {
      uploadFile = await this.uploadImageToFileManager(hashedKey, image);
    } catch (error) {
      this.logger.error(
        `Invoice ID: ${hashedKey} System Error in uploadImageToGemini in gemini.service: ${error}`,
      );
      this.cache.put(hashedKey, PROGRESS_STATUS.SYSTEM_ERROR, null);
      return;
    }

    let result: any;

    try {
      result = await this.invoiceModel.generateContent([
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

    const invoiceFromGemini = JSON.parse(result.response.text());

    const invoice: IInvoice = cleanInvoice(invoiceFromGemini);
    this.cache.put(hashedKey, PROGRESS_STATUS.SUCCESS, invoice);
    return;
  }

  /**
   * save the image file to local storage and upload it to the google file manager
   * @param {string} hashedKey - The hashed key of the image file
   * @param  {Express.Multer.File} image - The image file to upload
   * @returns {Promise<UploadFileResponse>} - The UploadFileResponse of the uploaded file
   */
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
