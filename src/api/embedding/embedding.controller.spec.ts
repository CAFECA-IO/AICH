import { Test, TestingModule } from '@nestjs/testing';
import { EmbeddingController } from './embedding.controller';
import { EmbeddingService } from './embedding.service';

describe('EmbeddingController', () => {
  let controller: EmbeddingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmbeddingController],
      providers: [EmbeddingService],
    }).compile();

    controller = module.get<EmbeddingController>(EmbeddingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
