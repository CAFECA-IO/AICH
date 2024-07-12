import { StreamableFile } from '@nestjs/common';
import { PassThrough } from 'stream';

export async function processChatStream(stream) {
  const processedStream = new PassThrough(); // 使用 PassThrough 來處理和轉發數據

  (async () => {
    for await (const chunk of stream) {
      try {
        // 假设 chunk 是一个包含 answer 属性的对象
        if (chunk.answer) {
          const canContinue = processedStream.write(chunk.answer);
          if (!canContinue) {
            await new Promise((resolve) =>
              processedStream.once('drain', resolve),
            );
          }
        }
      } catch (error) {
        this.logger.warn(`Error in chatWithHistory: ${error}`);
        processedStream.end();
        throw error; // 或处理错误
      }
    }
    processedStream.end();
  })();
  const streamableFile = new StreamableFile(processedStream);
  return streamableFile;
}
