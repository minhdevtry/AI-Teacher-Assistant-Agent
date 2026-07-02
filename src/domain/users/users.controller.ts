import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBody,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, QueryUsersDto } from './dto';
import { BaseResponseDto } from '../common';

@ApiTags('Users')
@Controller('api/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Users listed successfully' })
  async findAll(@Query() query: QueryUsersDto) {
    const result = await this.usersService.findAll({
      role: query.role,
      classCode: query.classCode,
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

  @Get('search/:query')
  @ApiOperation({ summary: 'Search users by name/nickname/phone' })
  @ApiParam({ name: 'query', description: 'Search keyword' })
  @ApiResponse({ status: 200, description: 'Search results' })
  async search(@Param('query') query: string) {
    const data = await this.usersService.search(query);
    return BaseResponseDto.ok(data);
  }

  @Get(':code')
  @ApiOperation({ summary: 'Get user by code' })
  @ApiParam({ name: 'code', description: 'User code (e.g. TCH001, STD001)' })
  @ApiResponse({ status: 200, description: 'User found' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findByCode(@Param('code') code: string) {
    const data = await this.usersService.findByCode(code);
    return BaseResponseDto.ok(data);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async create(@Body() dto: CreateUserDto) {
    const data = await this.usersService.create(dto);
    return BaseResponseDto.ok(data, 'User created successfully');
  }

  @Put(':code')
  @ApiOperation({ summary: 'Update a user' })
  @ApiParam({ name: 'code', description: 'User code' })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async update(@Param('code') code: string, @Body() dto: UpdateUserDto) {
    const data = await this.usersService.update(code, dto);
    return BaseResponseDto.ok(data, 'User updated successfully');
  }

  @Delete(':code')
  @ApiOperation({ summary: 'Soft delete a user' })
  @ApiParam({ name: 'code', description: 'User code' })
  @ApiResponse({ status: 200, description: 'User soft deleted' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async softDelete(@Param('code') code: string) {
    const data = await this.usersService.softDelete(code);
    return BaseResponseDto.ok(data, 'User soft deleted');
  }
}
