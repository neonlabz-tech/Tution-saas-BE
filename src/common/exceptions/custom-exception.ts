import { HttpException, HttpStatus } from '@nestjs/common';

export class CustomException extends HttpException {
  constructor(
    message: string | Record<string, unknown>,
    statusCode: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
    public readonly details?: unknown,
  ) {
    const response =
      typeof message === 'object'
        ? message
        : {
            message,
            error: details ? { details } : undefined,
          };

    super(response, statusCode);
  }
}

export class BadRequestException extends CustomException {
  constructor(message: string, details?: unknown) {
    super(message, HttpStatus.BAD_REQUEST, details);
  }
}

export class ValidationException extends CustomException {
  constructor(
    message: string,
    public readonly validationErrors: unknown[],
  ) {
    super(message, HttpStatus.BAD_REQUEST, validationErrors);
  }
}

export class NotFoundException extends CustomException {
  constructor(message: string) {
    super(message, HttpStatus.NOT_FOUND);
  }
}

export class UnauthorizedException extends CustomException {
  constructor(message = 'Unauthorized') {
    super(message, HttpStatus.UNAUTHORIZED);
  }
}

export class ForbiddenException extends CustomException {
  constructor(message = 'Forbidden') {
    super(message, HttpStatus.FORBIDDEN);
  }
}

export class ConflictException extends CustomException {
  constructor(message: string) {
    super(message, HttpStatus.CONFLICT);
  }
}

export class InternalServerErrorException extends CustomException {
  constructor(message = 'Internal Server Error') {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
