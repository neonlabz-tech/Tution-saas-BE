import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Role } from '../enums/role.enum.js';

export interface AuthenticatedUser {
  sub: string;
  email: string;
  fullName: string;
  role: Role;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    return request.user;
  },
);
