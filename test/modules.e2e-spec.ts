import {
  BadRequestException,
  type INestApplication,
  StandardSchemaValidationPipe,
} from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AttendanceRecord } from '../src/attendance/schemas/attendance.schema.js';
import {
  AllExceptionsFilter,
  HttpExceptionFilter,
} from '../src/common/filters/index.js';
import { ResponseInterceptor } from '../src/common/interceptors/index.js';
import { ModuleStatus } from '../src/enums/status.enum.js';
import { ModulesController } from '../src/modules/modules.controller.js';
import { ModulesService } from '../src/modules/modules.service.js';
import { CourseModule } from '../src/modules/schemas/module.schema.js';
import { OnlineClass } from '../src/online-classes/schemas/online-class.schema.js';
import { Student } from '../src/students/schemas/student.schema.js';
import { Teacher } from '../src/teachers/schemas/teacher.schema.js';

describe('Modules API HTTP Pipeline (e2e)', () => {
  let app: INestApplication;
  let mockModuleModel: Record<string, ReturnType<typeof vi.fn>>;
  let mockTeacherModel: Record<string, ReturnType<typeof vi.fn>>;
  let mockStudentModel: Record<string, ReturnType<typeof vi.fn>>;
  let mockOnlineClassModel: Record<string, ReturnType<typeof vi.fn>>;
  let mockAttendanceModel: Record<string, ReturnType<typeof vi.fn>>;

  const chainable = <T>(value: T) => ({
    select: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(value),
  });

  const sampleModule = {
    _id: '507f1f77bcf86cd799439011',
    id: 'mod_mth',
    code: 'MTH-101',
    name: 'Advanced Mathematics',
    description: 'Calculus, algebra and structured problem-solving.',
    fee: 72000,
    duration: '6 months',
    teacherId: 'TCH-001',
    batches: ['2025-A Morning', '2025-B Evening'],
    status: ModuleStatus.ACTIVE,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
  };

  beforeAll(async () => {
    mockModuleModel = {
      find: vi.fn().mockReturnValue(chainable([sampleModule])),
      findOne: vi.fn().mockImplementation((filter: any) => {
        if (filter?.id === 'mod_mth' || filter?.code === 'MTH-101') {
          return chainable(sampleModule);
        }
        return chainable(null);
      }),
      exists: vi.fn().mockResolvedValue(false),
      create: vi.fn().mockImplementation((payload: any) => {
        if (Array.isArray(payload)) {
          return Promise.resolve(payload.map((p) => ({ ...sampleModule, ...p })));
        }
        return Promise.resolve({ ...sampleModule, ...payload });
      }),
      deleteOne: vi.fn().mockResolvedValue({ acknowledged: true, deletedCount: 1 }),
    };

    mockTeacherModel = {
      find: vi.fn().mockReturnValue(chainable([{ id: 'TCH-001', fullName: 'Dr. Anura Wijesekara' }])),
      findOne: vi.fn().mockImplementation((filter: any) => {
        if (filter?.id === 'TCH-001') {
          return chainable({ id: 'TCH-001', fullName: 'Dr. Anura Wijesekara', email: 'anura@eduflow.lk' });
        }
        return chainable(null);
      }),
      updateOne: vi.fn().mockResolvedValue({ acknowledged: true }),
      updateMany: vi.fn().mockResolvedValue({ acknowledged: true }),
    };

    mockStudentModel = {
      find: vi.fn().mockReturnValue(chainable([
        {
          id: 'STU-2026-001',
          fullName: 'Nimal Perera',
          batch: '2025-A Morning',
          status: 'active',
          email: 'nimal@mail.lk',
        },
      ])),
      aggregate: vi.fn().mockResolvedValue([{ _id: 'mod_mth', count: 5 }]),
      updateMany: vi.fn().mockResolvedValue({ acknowledged: true, modifiedCount: 1 }),
    };

    mockOnlineClassModel = {
      deleteMany: vi.fn().mockResolvedValue({ acknowledged: true, deletedCount: 2 }),
    };

    mockAttendanceModel = {
      deleteMany: vi.fn().mockResolvedValue({ acknowledged: true, deletedCount: 4 }),
    };

    const mockSession = {
      withTransaction: vi.fn().mockImplementation(async (cb: () => Promise<void>) => {
        await cb();
      }),
      endSession: vi.fn().mockResolvedValue(undefined),
    };

    const mockConnection = {
      startSession: vi.fn().mockResolvedValue(mockSession),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ModulesController],
      providers: [
        ModulesService,
        { provide: getModelToken(CourseModule.name), useValue: mockModuleModel },
        { provide: getModelToken(Teacher.name), useValue: mockTeacherModel },
        { provide: getModelToken(Student.name), useValue: mockStudentModel },
        { provide: getModelToken(OnlineClass.name), useValue: mockOnlineClassModel },
        { provide: getModelToken(AttendanceRecord.name), useValue: mockAttendanceModel },
        { provide: getConnectionToken(), useValue: mockConnection },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new StandardSchemaValidationPipe({
        exceptionFactory: (issues) =>
          new BadRequestException({
            message: 'Validation failed',
            details: issues.map((issue) => ({
              field: issue.path?.map((s) => String((s as any)?.key ?? s)).join('.') || 'general',
              message: issue.message,
            })),
          }),
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter(), new AllExceptionsFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());

    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/modules returns modules wrapped with ApiResponse', async () => {
    const res = await request(app.getHttpServer()).get('/api/modules');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].id).toBe('mod_mth');
    expect(res.body.data[0].teacher).toEqual({
      id: 'TCH-001',
      fullName: 'Dr. Anura Wijesekara',
    });
    expect(res.body.data[0].enrolledCount).toBe(5);
  });

  it('GET /api/modules/:id returns module detail', async () => {
    const res = await request(app.getHttpServer()).get('/api/modules/mod_mth');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('mod_mth');
    expect(res.body.data.enrolledCount).toBe(1);
    expect(res.body.data.revenuePotential).toBe(72000);
    expect(res.body.data.enrolledStudents).toHaveLength(1);
  });

  it('POST /api/modules fails with 400 when validation rules fail', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/modules')
      .send({
        code: 'M',
        name: 'Math',
        fee: 500, // below 1000
        batches: [],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/modules succeeds with 201 when valid', async () => {
    mockModuleModel.findOne.mockReturnValue(chainable(null));

    const res = await request(app.getHttpServer())
      .post('/api/modules')
      .send({
        code: 'CHE-103',
        name: 'Chemistry',
        description: 'Organic, inorganic and physical chemistry.',
        fee: 66000,
        duration: '6 months',
        batches: ['2025-A Morning'],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.code).toBe('CHE-103');
  });

  it('DELETE /api/modules/:id cascades and returns deleted true', async () => {
    mockModuleModel.findOne.mockReturnValue(chainable(sampleModule));

    const res = await request(app.getHttpServer()).delete('/api/modules/mod_mth');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deleted).toBe(true);
    expect(res.body.data.id).toBe('mod_mth');
  });
});
