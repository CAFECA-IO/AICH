import { Test, TestingModule } from '@nestjs/testing';
import { BeforeAppStartService } from '@/libs/before_app_start/before_app_start.service';

describe('BeforeAppStartService', () => {
  let service: BeforeAppStartService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BeforeAppStartService],
    }).compile();

    service = module.get<BeforeAppStartService>(BeforeAppStartService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
