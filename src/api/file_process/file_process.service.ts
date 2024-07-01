import { Injectable } from '@nestjs/common';
import { PDFLoader } from 'langchain/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

@Injectable()
export class FileProcessService {
  async processPDFFile(filePath: string) {
    const loader = new PDFLoader(filePath);
    const docs = await loader.load();
    const splitter = new RecursiveCharacterTextSplitter();
    return splitter.splitDocuments(docs);
  }
}
