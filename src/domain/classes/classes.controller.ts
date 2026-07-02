import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { ClassesService } from './classes.service';
import { CreateClassDto, UpdateClassDto, QueryClassesDto } from './dto';
import { BaseResponseDto } from '../common';

@ApiTags('Classes')
@Controller('api/classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Get()
  @ApiOperation({ summary: 'List classes with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Classes listed successfully' })
  async findAll(@Query() query: QueryClassesDto) {
    const result = await this.classesService.findAll({
      teacherCode: query.teacherCode,
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
    return BaseResponseDto.paginated(
      result.data,
      result.total,
      result.page,
      result.limit,
    );
  }

  @Get(':code')
  @ApiOperation({ summary: 'Get class by code' })
  @ApiParam({ name: 'code', description: 'Class code (e.g. CLS001)' })
  @ApiResponse({ status: 200, description: 'Class found' })
  @ApiResponse({ status: 404, description: 'Class not found' })
  async findByCode(@Param('code') code: string) {
    const data = await this.classesService.findByCode(code);
    return BaseResponseDto.ok(data);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new class' })
  @ApiBody({ type: CreateClassDto })
  @ApiResponse({ status: 201, description: 'Class created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async create(@Body() dto: CreateClassDto) {
    const data = await this.classesService.create(dto);
    return BaseResponseDto.ok(data, 'Class created successfully');
  }

  @Put(':code')
  @ApiOperation({ summary: 'Update a class' })
  @ApiParam({ name: 'code', description: 'Class code' })
  @ApiBody({ type: UpdateClassDto })
  @ApiResponse({ status: 200, description: 'Class updated successfully' })
  @ApiResponse({ status: 404, description: 'Class not found' })
  async update(@Param('code') code: string, @Body() dto: UpdateClassDto) {
    const data = await this.classesService.update(code, dto);
    return BaseResponseDto.ok(data, 'Class updated successfully');
  }

  @Delete(':code')
  @ApiOperation({ summary: 'Soft delete a class' })
  @ApiParam({ name: 'code', description: 'Class code' })
  @ApiResponse({ status: 200, description: 'Class soft deleted' })
  @ApiResponse({ status: 404, description: 'Class not found' })
  async softDelete(@Param('code') code: string) {
    const data = await this.classesService.softDelete(code);
    return BaseResponseDto.ok(data, 'Class soft deleted');
  }
}
