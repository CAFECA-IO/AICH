import { Injectable } from '@nestjs/common';
import { GoogleVisionService } from 'src/google_vision/google_vision.service';
import { LlamaService } from 'src/llama/llama.service';

@Injectable()
export class OcrService {
  constructor(
    private readonly googleVisionService: GoogleVisionService,
    private readonly llamaService: LlamaService,
  ) {}
}
