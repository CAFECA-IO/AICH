import { PartialType } from '@nestjs/mapped-types';
import { CreateEmbeddingDto } from '@/api/embedding/dto/create-embedding.dto';

export class UpdateEmbeddingDto extends PartialType(CreateEmbeddingDto) {}
