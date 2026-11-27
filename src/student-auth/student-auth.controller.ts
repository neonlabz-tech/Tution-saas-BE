import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import {
  type AuthenticatedUser,
  CurrentUser,
} from '../decorators/current-user.decorator.js';
import { Public } from '../decorators/public.decorator.js';
import { StudentForgotPasswordDto } from './dto/student-forgot-password.dto.js';
import { StudentLoginDto } from './dto/student-login.dto.js';
import { StudentRegisterDto } from './dto/student-register.dto.js';
import { StudentResetPasswordDto } from './dto/student-reset-password.dto.js';
import { StudentChangePasswordDto } from './dto/student-change-password.dto.js';
import { StudentJwtGuard } from './guards/student-jwt.guard.js';
import {
  STUDENT_COOKIE_MAX_AGE,
  STUDENT_COOKIE_NAME,
  StudentAuthService,
} from './student-auth.service.js';

export function getStudentCookieOptions(maxAgeMs = STUDENT_COOKIE_MAX_AGE): CookieOptions {
  const isProd = process.env.NODE_ENV === 'production';
  const forceSecure = process.env.COOKIE_SECURE === 'true';
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd || forceSecure,
    path: '/',
    maxAge: maxAgeMs,
  };
}

@Public()
@Controller('student-auth')
export class StudentAuthController {
  constructor(private readonly studentAuthService: StudentAuthService) {}

  @Get('check-account')
  async checkAccount(@Query('email') email: string) {
    return this.studentAuthService.checkAccount(email);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: StudentRegisterDto) {
    return this.studentAuthService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: StudentLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.studentAuthService.login(dto);
    res.cookie(
      STUDENT_COOKIE_NAME,
      result.accessToken,
      getStudentCookieOptions(STUDENT_COOKIE_MAX_AGE),
    );
    return result;
  }

  @UseGuards(StudentJwtGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.studentAuthService.me(user.sub);
  }

  @UseGuards(StudentJwtGuard)
  @Patch('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StudentChangePasswordDto,
  ) {
    return this.studentAuthService.changePassword(user.sub, dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(STUDENT_COOKIE_NAME, getStudentCookieOptions(0));
    return { loggedOut: true };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: StudentForgotPasswordDto) {
    return this.studentAuthService.forgotPassword(dto);
  }

  @Get('reset-password/validate')
  async validateResetToken(@Query('token') token: string) {
    const valid = await this.studentAuthService.validateResetToken(token);
    return { valid };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: StudentResetPasswordDto) {
    return this.studentAuthService.resetPassword(dto);
  }
}
