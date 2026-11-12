import {
  BadRequestException,
  type INestApplication,
  StandardSchemaValidationPipe,
} from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AttendanceRecord } from '../src/attendance/schemas/attendance-record.schema.js';
import {
  AllExceptionsFilter,
  HttpExceptionFilter,
} from '../src/common/filters/index.js';
import { ResponseInterceptor } from '../src/common/interceptors/index.js';
import { CourseModule } from '../src/modules/schemas/module.schema.js';
import { Transaction } from '../src/payments/schemas/transaction.schema.js';
import { Counter } from '../src/students/schemas/counter.schema.js';
import { Student } from '../src/students/schemas/student.schema.js';
import { StudentsController } from '../src/students/students.controller.js';
import { StudentsService } from '../src/students/students.service.js';

describe('Students API HTTP Pipeline (e2e)', () => {
  let app: INestApplication;
  let mockStudentModel: Record<string, ReturnType<typeof vi.fn>>;
  let mockCounterModel: Record<string, ReturnType<typeof vi.fn>>;
  let mockModuleModel: Record<string, ReturnType<typeof vi.fn>>;
  let mockAttendanceModel: Record<string, ReturnType<typeof vi.fn>>;
  let mockTransactionModel: Record<string, ReturnType<typeof vi.fn>>;

  const chainable = <T>(value: T) => ({
    select: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(value),
  });

  beforeAll(async () => {
    const sampleStudent = {
      _id: '507f1f77bcf86cd799439011',
      id: 'STU-2026-001',
      ref: 'abc123def456gh78',
      fullName: 'Nimal Perera',
      email: 'nimal.perera@mail.lk',
      phone: '0771234567',
      dob: '2007-05-14',
      address: '42 Temple Road, Colombo 07',
      guardianName: 'Sunil Perera',
      guardianPhone: '0712345678',
      batch: '2025-A Morning',
      moduleIds: ['mod_mth'],
      enrollmentDate: '2026-11-11',
      status: 'pending',
      qrRotatedAt: null,
    };

    mockStudentModel = {
      countDocuments: vi.fn().mockResolvedValue(1),
      find: vi.fn().mockReturnValue(chainable([sampleStudent])),
      findOne: vi.fn().mockReturnValue(chainable(sampleStudent)),
      exists: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      findOneAndUpdate: vi.fn(),
      deleteOne: vi.fn(),
    };

    mockCounterModel = {
      findOneAndUpdate: vi.fn().mockReturnValue(
        chainable({ _id: 'student:2026', seq: 2 }),
      ),
    };

    mockModuleModel = {
      find: vi.fn().mockReturnValue(
        chainable([
          { id: 'mod_mth', code: 'MTH-101', name: 'Advanced Mathematics', fee: 4500 },
        ]),
      ),
    };

    mockAttendanceModel = {
      find: vi.fn().mockReturnValue(chainable([])),
      deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    };

    mockTransactionModel = {
      find: vi.fn().mockReturnValue(chainable([])),
    };

    const mockConnection = {
      startSession: vi.fn().mockResolvedValue({
        withTransaction: vi.fn(async (fn: () => Promise<void>) => fn()),
        endSession: vi.fn().mockResolvedValue(undefined),
      }),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      controllers: [StudentsController],
      providers: [
        StudentsService,
        { provide: getModelToken(Student.name), useValue: mockStudentModel },
        { provide: getModelToken(Counter.name), useValue: mockCounterModel },
        { provide: getModelToken(CourseModule.name), useValue: mockModuleModel },
        {
          provide: getModelToken(AttendanceRecord.name),
          useValue: mockAttendanceModel,
        },
        {
          provide: getModelToken(Transaction.name),
          useValue: mockTransactionModel,
        },
        { provide: getConnectionToken(), useValue: mockConnection },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new StandardSchemaValidationPipe({
        exceptionFactory: (issues) =>
          new BadRequestException({
            message: 'Validation failed',
            details: issues.map((issue) => ({
              field:
                issue.path
                  ?.map((segment) =>
                    typeof segment === 'object' &&
                    segment !== null &&
                    'key' in segment
                      ? String(segment.key)
                      : String(segment),
                  )
                  .join('.') || 'general',
              message: issue.message,
            })),
          }),
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter(), new AllExceptionsFilter());
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/students returns wrapped student list with financial summary', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/students')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.items[0]).toMatchObject({
      id: 'STU-2026-001',
      feeTotal: 4500,
      paidTotal: 0,
      outstanding: 4500,
    });
  });

  it('GET /api/students/lookup?code=EDUFLOW:<ref> resolves student before :id route', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/students/lookup?code=EDUFLOW:abc123def456gh78')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.qrPayload).toBe('EDUFLOW:abc123def456gh78');
  });

  it('POST /api/students validates request body with StandardSchemaValidationPipe and formats 400 errors', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/students')
      .send({ fullName: 'A', phone: '123' })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });
});
