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
import { ImagePostInvoiceDto } from '@/api/invoices/dto/image_post_invoice.dto';
@Injectable()
export class InvoiceService {
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

    this.logger = new Logger(InvoiceService.name);
    this.logger.log('invoiceService initialized');
  }

  /**
   * Info (20240815 - Murky): Get the status of the invoice result by resultId
   * @param {string} resultId - The resultId of the invoice result
   * @returns {PROGRESS_STATUS} - The status of the invoice result
   */
  public getInvoiceStatus(resultId: string): PROGRESS_STATUS {
    let status = PROGRESS_STATUS.NOT_FOUND;
    const result = this.cache.get(resultId);

    if (result) {
      status = result.status;
    }

    return status;
  }

  /**
   * Info (20240815 - Murky): Get the invoice result by resultId
   * @param {string} resultId - The resultId of the invoice result
   * @returns {IInvoice | null} - The invoice result, which is an invoice object
   */
  public getInvoiceResult(resultId: string): IInvoice | null {
    const result = this.cache.get(resultId);
    let value = null;
    if (result && result.status === PROGRESS_STATUS.SUCCESS) {
      value = result.value;
    }

    return value;
  }

  /**
   *  Info (20240815 - Murky): Start the process of generating invoice from the image, it will return the resultId and status of the process immediately
   * @param {Express.Multer.File} image - The image file to generate invoice from
   * @returns {{ id: string; status: PROGRESS_STATUS }} - The resultId and status of the process
   */
  public startGenerateInvoice(
    imagePostInvoiceDto: ImagePostInvoiceDto,
    image: Express.Multer.File,
  ): AccountResultStatus {
    // Info (20240815 - Murky): Pipe line => startGenerateInvoice => uploadImageToinvoice
    const imageName = imagePostInvoiceDto.imageName || image.originalname;
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
      this.uploadImageToInvoice(hashedKey, image);

      result = {
        resultId: hashedKey,
        status: PROGRESS_STATUS.IN_PROGRESS,
      };
    }

    return result;
  }

  /**
   *  Info (20240815 - Murky): Generate a hashed key for the image file, it combines the file name (or random uuid) and a combined timestamp
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
   *  Info (20240815 - Murky): save the image file to local storage and upload it to the google file manager
   * @param {string} hashedKey - The hashed key of the image file
   * @param  {Express.Multer.File} image - The image file to upload
   * @returns {Promise<UploadFileResponse>} - The UploadFileResponse of the uploaded file
   */
  private async uploadImageToInvoice(
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
        `Invoice ID: ${hashedKey} System Error in uploadImageToinvoice in invoice.service: ${error}`,
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
        `Invoice ID: ${hashedKey} LLM Error in generateContent in invoice.service: ${error}`,
      );
      this.cache.put(hashedKey, PROGRESS_STATUS.LLM_ERROR, null);
      return;
    }

    try {
      const invoiceFromInvoice = JSON.parse(result.response.text());

      const invoice: IInvoice = cleanInvoice(invoiceFromInvoice);
      this.cache.put(hashedKey, PROGRESS_STATUS.SUCCESS, invoice);
    } catch (error) {
      this.logger.error(
        `Invoice ID: ${hashedKey} LLM Error in generateContent in invoice.service due to parsing gemini output failed or gemini not return correct json: ${error}`,
      );
      this.cache.put(hashedKey, PROGRESS_STATUS.LLM_ERROR, null);
      return;
    }

    return;
  }

  /**
   *  Info (20240815 - Murky): save the image file to local storage and upload it to the google file manager
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
        `Error in uploadImageToFileManager in invoice.service: ${error}`,
      );
      throw error;
    }
  }
}
