import {
  BadRequestException,
  type INestApplication,
  StandardSchemaValidationPipe,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStudentSchema } from './dto/create-student.dto.js';
import { lookupStudentQuerySchema } from './dto/lookup-student.dto.js';
import { studentQuerySchema } from './dto/student-query.dto.js';
import { updateStudentSchema } from './dto/update-student.dto.js';
import { StudentsController } from './students.controller.js';
import { StudentsService } from './students.service.js';

describe('StudentsController & Zod DTO Schemas', () => {
  let controller: StudentsController;
  let mockStudentsService: {
    findAll: ReturnType<typeof vi.fn>;
    lookupByCode: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    rotateQr: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockStudentsService = {
      findAll: vi.fn().mockResolvedValue({ items: [], pagination: {}, summary: {} }),
      lookupByCode: vi.fn().mockResolvedValue({ id: 'STU-2026-001' }),
      findOne: vi.fn().mockResolvedValue({ id: 'STU-2026-001' }),
      create: vi.fn().mockResolvedValue({ id: 'STU-2026-001', status: 'pending' }),
      update: vi.fn().mockResolvedValue({ id: 'STU-2026-001', status: 'active' }),
      remove: vi.fn().mockResolvedValue({ deleted: true }),
      rotateQr: vi.fn().mockResolvedValue({ id: 'STU-2026-001', qrPayload: 'EDUFLOW:newref' }),
    };

    controller = new StudentsController(mockStudentsService as never);
  });

  describe('controller delegation', () => {
    it('delegates findAll, lookup, findOne, create, update, remove, and rotateQr to StudentsService', async () => {
      const query = studentQuerySchema.parse({});
      await controller.findAll(query);
      expect(mockStudentsService.findAll).toHaveBeenCalledWith(query);

      await controller.lookup({ code: 'EDUFLOW:abc123' });
      expect(mockStudentsService.lookupByCode).toHaveBeenCalledWith(
        'EDUFLOW:abc123',
      );

      await controller.findOne('STU-2026-001');
      expect(mockStudentsService.findOne).toHaveBeenCalledWith('STU-2026-001');

      const createDto = createStudentSchema.parse({
        fullName: 'Nimal Perera',
        email: 'Nimal@Mail.LK',
        phone: '0771234567',
        dob: '2007-05-14',
        address: '42 Temple Road, Colombo',
        guardianName: 'Sunil Perera',
        guardianPhone: '0712345678',
        batch: '2025-A Morning',
        moduleIds: ['mod_mth'],
      });
      await controller.create(createDto);
      expect(mockStudentsService.create).toHaveBeenCalledWith(createDto);

      const updateDto = updateStudentSchema.parse({ status: 'active' });
      await controller.update('STU-2026-001', updateDto);
      expect(mockStudentsService.update).toHaveBeenCalledWith(
        'STU-2026-001',
        updateDto,
      );

      await controller.remove('STU-2026-001');
      expect(mockStudentsService.remove).toHaveBeenCalledWith('STU-2026-001');

      await controller.rotateQr('STU-2026-001');
      expect(mockStudentsService.rotateQr).toHaveBeenCalledWith('STU-2026-001');
    });
  });

  describe('DTO schemas with StandardSchemaValidationPipe', () => {
    it('applies pending default status, normalizes email, and deduplicates moduleIds on create', () => {
      const parsed = createStudentSchema.parse({
        fullName: '  Nimal Perera  ',
        email: '  NIMAL@MAIL.LK  ',
        phone: '0771234567',
        dob: '2007-05-14',
        address: '42 Temple Road',
        guardianName: 'Sunil Perera',
        guardianPhone: '0712345678',
        batch: '2025-A Morning',
        moduleIds: ['mod_mth', 'mod_mth', 'mod_phy'],
      });

      expect(parsed.status).toBe('pending');
      expect(parsed.email).toBe('nimal@mail.lk');
      expect(parsed.fullName).toBe('Nimal Perera');
      expect(parsed.enrollmentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(parsed.moduleIds).toEqual(['mod_mth', 'mod_phy']);
    });

    it('rejects invalid phone, calendar dates like 2025-02-30, and empty moduleIds', async () => {
      const pipe = new StandardSchemaValidationPipe({
        exceptionFactory: (issues) =>
          new BadRequestException({ message: 'Validation failed', details: issues }),
      });

      await expect(
        pipe.transform(
          {
            fullName: 'Ni',
            email: 'bad-email',
            phone: '12345',
            dob: '2025-02-30',
            address: '123',
            guardianName: 'Su',
            guardianPhone: '077123456',
            batch: '',
            moduleIds: [],
          },
          {
            type: 'body',
            schema: createStudentSchema,
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('does not inject create defaults when validating partial update payloads and strips id/ref', () => {
      const parsed = updateStudentSchema.parse({
        fullName: 'Updated Name',
        id: 'STU-9999-999',
        ref: 'attempted-ref-override',
      });

      expect(parsed).toEqual({ fullName: 'Updated Name' });
      expect('status' in parsed).toBe(false);
      expect('enrollmentDate' in parsed).toBe(false);
      expect('id' in parsed).toBe(false);
      expect('ref' in parsed).toBe(false);
    });

    it('coerces pagination defaults cleanly for GET /students and validates lookup code', () => {
      const query = studentQuerySchema.parse({ page: '2', limit: '8' });
      expect(query).toMatchObject({
        page: 2,
        limit: 8,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      expect(lookupStudentQuerySchema.parse({ code: ' EDUFLOW:abc ' })).toEqual({
        code: 'EDUFLOW:abc',
      });
    });
  });

  describe('Swagger OpenAPI document generation', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [StudentsController],
        providers: [{ provide: StudentsService, useValue: mockStudentsService }],
      }).compile();

      app = moduleRef.createNestApplication();
      app.setGlobalPrefix('api');
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('generates valid Swagger OpenAPI document with lookup route ordered before :id', () => {
      const config = new DocumentBuilder()
        .setTitle('EduFlow API')
        .setVersion('1.0')
        .build();
      const doc = SwaggerModule.createDocument(app, config);
      const pathKeys = Object.keys(doc.paths);

      expect(doc.paths['/api/students']).toBeDefined();
      expect(doc.paths['/api/students/lookup']).toBeDefined();
      expect(doc.paths['/api/students/{id}']).toBeDefined();
      expect(doc.paths['/api/students/{id}/rotate-qr']).toBeDefined();
      expect(pathKeys.indexOf('/api/students/lookup')).toBeLessThan(
        pathKeys.indexOf('/api/students/{id}'),
      );
    });
  });
});
