import { Test, TestingModule } from '@nestjs/testing';
import { LangChainService } from '@/lang_chain/lang_chain.service';

describe('LangChainService', () => {
  let service: LangChainService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LangChainService],
    }).compile();

    service = module.get<LangChainService>(LangChainService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
