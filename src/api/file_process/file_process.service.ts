import { Injectable } from '@nestjs/common';
import { PDFLoader } from 'langchain/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { Document } from 'langchain/document';

@Injectable()
export class FileProcessService {
  async processPDFFile(filePath: string): Promise<Document[]> {
    const loader = new PDFLoader(filePath);
    const docs = await loader.load();
    const splitter = new RecursiveCharacterTextSplitter();
    const processedDocs = await splitter.splitDocuments(docs);
    return processedDocs;
  }
}
