import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  type AuthenticatedUser,
  CurrentUser,
} from '../decorators/current-user.decorator.js';
import { Public } from '../decorators/public.decorator.js';
import {
  AUTH_COOKIE_NAME,
  getAuthCookieOptions,
  parseDurationToMs,
} from './auth-cookie.js';
import { AuthService } from './auth.service.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  @Public()
  @Get('config')
  getLoginConfig() {
    return this.authService.getLoginConfig();
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    res.cookie(
      AUTH_COOKIE_NAME,
      result.accessToken,
      getAuthCookieOptions(parseDurationToMs(result.expiresIn)),
    );
    return result;
  }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    res.cookie(
      AUTH_COOKIE_NAME,
      result.accessToken,
      getAuthCookieOptions(parseDurationToMs(result.expiresIn)),
    );
    return result;
  }

  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getProfile(user.sub);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(AUTH_COOKIE_NAME, getAuthCookieOptions());
    return this.authService.logout();
  }

  @Patch('change-password')
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.sub, dto);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
