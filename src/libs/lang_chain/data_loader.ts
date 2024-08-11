import { PDFLoader } from 'langchain/document_loaders/fs/pdf';
import { Document } from '@langchain/core/documents';

export async function processPDF(
  filePath: string,
): Promise<Document<Record<string, any>>[]> {
  const loader = new PDFLoader(filePath);

  const docs = await loader.load();
  return docs;
}
