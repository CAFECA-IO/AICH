import { Logger, StreamableFile } from '@nestjs/common';
import { PassThrough } from 'stream';

export async function processChatStream(
  stream: ReadableStream,
): Promise<StreamableFile> {
  const processedStream = new PassThrough();
  const logger = new Logger('processChatStream');

  // 异步处理数据流
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
      processedStream.end(); // 完成写入，关闭流
    } catch (error) {
      logger.error(`Error in processing stream: ${error}`);
      processedStream.destroy(error); // 销毁流并传递错误
    }
  })();

  return new StreamableFile(processedStream);
}
