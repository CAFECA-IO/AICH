import { Test, TestingModule } from '@nestjs/testing';
import { LlamaService } from '@/libs/llama/llama.service';

describe('LlamaService', () => {
  let service: LlamaService<string>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LlamaService],
    }).compile();

    service = module.get<LlamaService<string>>(LlamaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
