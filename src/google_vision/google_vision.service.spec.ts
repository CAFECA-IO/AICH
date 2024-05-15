import { Test, TestingModule } from '@nestjs/testing';
import { GoogleVisionService } from '@/google_vision/google_vision.service';

// Todo: Info Murky (20240429): Write the test cases for the GoogleVisionService

describe('GoogleVisionService', () => {
  let service: GoogleVisionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GoogleVisionService],
    }).compile();

    service = module.get<GoogleVisionService>(GoogleVisionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
