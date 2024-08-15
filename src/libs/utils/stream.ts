import { Logger, StreamableFile } from '@nestjs/common';
import { PassThrough } from 'stream';

export async function processChatStream(
  stream: ReadableStream,
): Promise<StreamableFile> {
  const processedStream = new PassThrough();
  const logger = new Logger('processChatStream');

  // Info (20240815 - Jacky) 使用 async generator 來處理 stream
  (async () => {
    try {
      for await (const chunk of stream) {
        const data = chunk.answer || chunk.content;
        if (data) {
          const canContinue = processedStream.write(data);
          if (!canContinue) {
            await new Promise((resolve) =>
              processedStream.once('drain', resolve),
            );
          }
        }
      }
      processedStream.end(); // Info (20240815 - Jacky) 結束 stream
    } catch (error) {
      logger.error(`Error in processing stream: ${error}`);
      processedStream.destroy(error); // Info (20240815 - Jacky) 遇到錯誤時，銷毀 stream
    }
  })();

  return new StreamableFile(processedStream);
}
