import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AllowedRoles } from '../decorators/roles.decorator.js';
import { Role } from '../enums/role.enum.js';
import { CreateNoticeDto } from './dto/create-notice.dto.js';
import { NoticesService } from './notices.service.js';

@Controller('notices')
@AllowedRoles(Role.ADMIN, Role.SUPER_ADMIN)
export class NoticesController {
  constructor(
    @Inject(NoticesService)
    private readonly noticesService: NoticesService,
  ) {}

  @Get()
  findAll() {
    return this.noticesService.findAll();
  }

  @Post()
  create(@Body() dto: CreateNoticeDto) {
    return this.noticesService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: CreateNoticeDto) {
    return this.noticesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.noticesService.remove(id);
  }
}
