import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { CreateEmbeddingDto } from './dto/create-embedding.dto';
import { UpdateEmbeddingDto } from './dto/update-embedding.dto';

@Controller('embedding')
export class EmbeddingController {
  constructor(private readonly embeddingService: EmbeddingService) {}

  @Post()
  create(@Body() createEmbeddingDto: CreateEmbeddingDto) {
    return this.embeddingService.create(createEmbeddingDto);
  }

  @Get()
  findAll() {
    return this.embeddingService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.embeddingService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateEmbeddingDto: UpdateEmbeddingDto) {
    return this.embeddingService.update(+id, updateEmbeddingDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.embeddingService.remove(+id);
  }
}
