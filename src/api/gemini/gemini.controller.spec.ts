import { Test, TestingModule } from '@nestjs/testing';
import { GeminiController } from '@/api/gemini/gemini.controller';
import { GeminiService } from '@/api/gemini/gemini.service';

describe('GeminiController', () => {
  let controller: GeminiController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GeminiController],
      providers: [GeminiService],
    }).compile();

    controller = module.get<GeminiController>(GeminiController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
