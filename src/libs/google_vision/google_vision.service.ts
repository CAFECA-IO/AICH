import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IBlockData } from '@/interfaces/google_vision';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { google } from '@google-cloud/vision/build/protos/protos';

@Injectable()
export class GoogleVisionService {
  private logger = new Logger(GoogleVisionService.name);
  private client: ImageAnnotatorClient;

  constructor(
    private readonly configService: ConfigService, // Info Murky (20240429): Inject the ConfigService to access the environment variables.
  ) {
    // Info Murky (20240429): Client Id can be found in GCP dash board
    const googleProjectId = this.configService.get<string>('GOOGLE_PROJECT_ID');

    // Info Murky (20240429): Google credentials need to download from GCP service account key
    // parse the json file and convert it to base64
    const googleCredentialsBase64 = this.configService.get<string>(
      'GOOGLE_CREDENTIALS_BASE64',
    );

    if (googleProjectId && googleCredentialsBase64) {
      this.client = new ImageAnnotatorClient({
        projectId: googleProjectId,
        credentials: JSON.parse(
          Buffer.from(googleCredentialsBase64, 'base64').toString('ascii'),
        ),
      });
    } else {
      this.client = null; // or handle the error case accordingly
    }
  }

  // Info Murky (20240429): This method returns the text description in the image, separated by lines.
  public async generateDescription(image: Buffer): Promise<string[]> {
    let result: google.cloud.vision.v1.IAnnotateImageResponse;
    try {
      result = (await this.client.textDetection(image))[0];
    } catch (error) {
      this.logger.error(
        `Error in google generating text description: ${error}`,
      );
      return [];
    }
    const detections = result.textAnnotations || [];

    if (!detections.length) {
      return [];
    }

    return detections[0].description?.split('\n') || [];
  }

  // Info Murky (20240429): This method returns full text annotation in the image.
  // it contains the text, and the vertices of the bounding box.
  public async generateFullTextAnnotation(
    image: Buffer,
  ): Promise<IBlockData[]> {
    const [result] = await this.client.textDetection(image);
    const { fullTextAnnotation } = result;

    const blockData: IBlockData[] = [];
    if (fullTextAnnotation?.pages?.length) {
      fullTextAnnotation?.pages?.forEach((page) => {
        page?.blocks?.forEach((block) => {
          const blockText = block.paragraphs
            ?.map((paragraph) =>
              paragraph.words
                ?.map((word) =>
                  word.symbols?.map((symbol) => symbol.text).join(''),
                )
                .join(''),
            )
            .join('\n');

          const blockVertices = block.boundingBox?.vertices?.map((vertex) => ({
            x: vertex.x,
            y: vertex.y,
          }));

          blockData.push({ blockText, blockVertices });
        });
      });
    }

    return blockData;
  }
}
