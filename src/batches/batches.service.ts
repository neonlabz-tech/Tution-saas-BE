import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CourseModule, type CourseModuleDocument } from '../modules/schemas/module.schema.js';
import { Student, type StudentDocument } from '../students/schemas/student.schema.js';
import { Teacher, type TeacherDocument } from '../teachers/schemas/teacher.schema.js';
import type { CreateBatchDto } from './dto/create-batch.dto.js';
import type { UpdateBatchDto } from './dto/update-batch.dto.js';
import { Batch, type BatchDocument } from './schemas/batch.schema.js';

export interface BatchItem {
  id: string;
  name: string;
  code: string;
  year: string;
  description: string;
  status: string;
  category?: 'al' | 'grade';
  studentCount: number;
  moduleCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

@Injectable()
export class BatchesService {
  constructor(
    @InjectModel(Batch.name)
    private readonly batchModel: Model<BatchDocument>,
    @InjectModel(Student.name)
    private readonly studentModel: Model<StudentDocument>,
    @InjectModel(CourseModule.name)
    private readonly moduleModel: Model<CourseModuleDocument>,
    @InjectModel(Teacher.name)
    private readonly teacherModel: Model<TeacherDocument>,
  ) {}

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async findAll(q?: string): Promise<BatchItem[]> {
    const filter: Record<string, unknown> = {};
    const searchTerm = q?.trim();
    if (searchTerm) {
      const tokens = searchTerm.split(/\s+/).filter(Boolean);
      if (tokens.length > 0) {
        filter.$and = tokens.map((token) => {
          const escaped = this.escapeRegex(token);
          const regex = new RegExp(escaped, 'i');
          return {
            $or: [
              { name: regex },
              { code: regex },
              { year: regex },
              { description: regex },
              { status: regex },
            ],
          };
        });
      }
    }

    const batches = await this.batchModel
      .find(filter)
      .sort({ year: -1, name: 1 })
      .lean<Batch[]>()
      .exec();

    // Compute live studentCount and moduleCount for each batch
    const results: BatchItem[] = await Promise.all(
      batches.map(async (b) => {
        const [studentCount, moduleCount] = await Promise.all([
          this.studentModel.countDocuments({ batch: b.name }).exec(),
          this.moduleModel.countDocuments({ batches: b.name }).exec(),
        ]);

        const inferredCategory: 'al' | 'grade' = b.category || (/\b(grade|ol|o\/l)\b/i.test(b.name) ? 'grade' : 'al');
        return {
          id: b.id,
          name: b.name,
          code: b.code || '',
          year: b.year || '',
          description: b.description || '',
          status: b.status || 'active',
          category: inferredCategory,
          studentCount,
          moduleCount,
          createdAt: (b as unknown as { createdAt?: Date }).createdAt,
          updatedAt: (b as unknown as { updatedAt?: Date }).updatedAt,
        };
      }),
    );

    return results;
  }

  async findOne(id: string): Promise<BatchItem> {
    const raw = id.trim();
    const query: Record<string, unknown> = {
      $or: [
        { id: raw },
        { name: new RegExp(`^${this.escapeRegex(raw)}$`, 'i') },
      ],
    };
    if (Types.ObjectId.isValid(raw)) {
      (query.$or as Array<Record<string, unknown>>).push({ _id: new Types.ObjectId(raw) });
    }

    const batch = await this.batchModel.findOne(query).lean<Batch>().exec();
    if (!batch) {
      throw new NotFoundException(`Batch "${id}" not found`);
    }

    const [studentCount, moduleCount] = await Promise.all([
      this.studentModel.countDocuments({ batch: batch.name }).exec(),
      this.moduleModel.countDocuments({ batches: batch.name }).exec(),
    ]);

    const inferredCategory: 'al' | 'grade' = batch.category || (/\b(grade|ol|o\/l)\b/i.test(batch.name) ? 'grade' : 'al');
    return {
      id: batch.id,
      name: batch.name,
      code: batch.code || '',
      year: batch.year || '',
      description: batch.description || '',
      status: batch.status || 'active',
      category: inferredCategory,
      studentCount,
      moduleCount,
      createdAt: (batch as unknown as { createdAt?: Date }).createdAt,
      updatedAt: (batch as unknown as { updatedAt?: Date }).updatedAt,
    };
  }

  async create(dto: CreateBatchDto): Promise<BatchItem> {
    const name = dto.name.trim();

    const existing = await this.batchModel
      .findOne({ name: new RegExp(`^${this.escapeRegex(name)}$`, 'i') })
      .exec();

    if (existing) {
      throw new ConflictException(`A batch named "${name}" already exists`);
    }

    const yearMatch = name.match(/\b(20\d\d)\b/);
    const inferredYear = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();
    const year = dto.year?.trim() || inferredYear;
    const code = dto.code?.trim() || (year ? `${year}-${name.slice(0, 3).toUpperCase()}` : name.slice(0, 4).toUpperCase());

    const id = `batch-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

    const inferredCategory: 'al' | 'grade' = dto.category || (/\b(grade|ol|o\/l)\b/i.test(name) ? 'grade' : 'al');

    const created = await this.batchModel.create({
      id,
      name,
      code,
      year,
      description: dto.description?.trim() || '',
      status: dto.status || 'active',
      category: inferredCategory,
    });

    const doc = typeof created.toObject === 'function' ? created.toObject() : (created as unknown as Batch);

    return {
      id: doc.id,
      name: doc.name,
      code: doc.code || code,
      year: doc.year || year,
      description: doc.description || '',
      status: doc.status || 'active',
      category: doc.category || inferredCategory,
      studentCount: 0,
      moduleCount: 0,
      createdAt: (doc as unknown as { createdAt?: Date }).createdAt,
      updatedAt: (doc as unknown as { updatedAt?: Date }).updatedAt,
    };
  }

  async update(id: string, dto: UpdateBatchDto): Promise<BatchItem> {
    const raw = id.trim();
    const query: Record<string, unknown> = {
      $or: [
        { id: raw },
        { name: new RegExp(`^${this.escapeRegex(raw)}$`, 'i') },
      ],
    };
    if (Types.ObjectId.isValid(raw)) {
      (query.$or as Array<Record<string, unknown>>).push({ _id: new Types.ObjectId(raw) });
    }

    const batch = await this.batchModel.findOne(query).exec();
    if (!batch) {
      throw new NotFoundException(`Batch "${id}" not found`);
    }

    const oldName = batch.name;
    const updatePayload: Partial<Batch> = {};

    if (dto.name !== undefined) {
      const newName = dto.name.trim();
      if (newName.toLowerCase() !== oldName.toLowerCase()) {
        const existing = await this.batchModel
          .findOne({
            name: new RegExp(`^${this.escapeRegex(newName)}$`, 'i'),
            _id: { $ne: batch._id },
          })
          .exec();
        if (existing) {
          throw new ConflictException(`A batch named "${newName}" already exists`);
        }
      }
      updatePayload.name = newName;
    }

    if (dto.code !== undefined) updatePayload.code = dto.code.trim();
    if (dto.year !== undefined) updatePayload.year = dto.year.trim();
    if (dto.description !== undefined) updatePayload.description = dto.description.trim();
    if (dto.status !== undefined) updatePayload.status = dto.status;
    if (dto.category !== undefined) updatePayload.category = dto.category;

    const updated = await this.batchModel
      .findOneAndUpdate({ _id: batch._id }, { $set: updatePayload }, { new: true })
      .exec();

    if (!updated) {
      throw new NotFoundException(`Batch "${id}" not found`);
    }

    // Cascade rename to students, modules, and teachers if name changed
    if (updatePayload.name && updatePayload.name !== oldName) {
      const newName = updatePayload.name;
      await Promise.all([
        this.studentModel.updateMany({ batch: oldName }, { $set: { batch: newName } }).exec(),
        this.moduleModel.updateMany({ batches: oldName }, { $set: { 'batches.$[elem]': newName } }, { arrayFilters: [{ elem: oldName }] }).exec(),
        this.teacherModel.updateMany({ batches: oldName }, { $set: { 'batches.$[elem]': newName } }, { arrayFilters: [{ elem: oldName }] }).exec(),
      ]);
    }

    const [studentCount, moduleCount] = await Promise.all([
      this.studentModel.countDocuments({ batch: updated.name }).exec(),
      this.moduleModel.countDocuments({ batches: updated.name }).exec(),
    ]);

    const inferredCategory: 'al' | 'grade' = updated.category || (/\b(grade|ol|o\/l)\b/i.test(updated.name) ? 'grade' : 'al');

    return {
      id: updated.id,
      name: updated.name,
      code: updated.code || '',
      year: updated.year || '',
      description: updated.description || '',
      status: updated.status || 'active',
      category: inferredCategory,
      studentCount,
      moduleCount,
      createdAt: (updated as unknown as { createdAt?: Date }).createdAt,
      updatedAt: (updated as unknown as { updatedAt?: Date }).updatedAt,
    };
  }

  async remove(id: string): Promise<{ success: boolean; message: string; id: string; name: string }> {
    const raw = id.trim();
    const query: Record<string, unknown> = {
      $or: [
        { id: raw },
        { name: new RegExp(`^${this.escapeRegex(raw)}$`, 'i') },
      ],
    };
    if (Types.ObjectId.isValid(raw)) {
      (query.$or as Array<Record<string, unknown>>).push({ _id: new Types.ObjectId(raw) });
    }

    const batch = await this.batchModel.findOne(query).exec();
    if (!batch) {
      throw new NotFoundException(`Batch "${id}" not found`);
    }

    const batchName = batch.name;
    const batchId = batch.id;

    await Promise.all([
      this.batchModel.deleteOne({ _id: batch._id }).exec(),
      this.moduleModel.updateMany({ batches: batchName }, { $pull: { batches: batchName } }).exec(),
      this.teacherModel.updateMany({ batches: batchName }, { $pull: { batches: batchName } }).exec(),
      this.studentModel.updateMany({ batch: batchName }, { $set: { batch: 'Unassigned' } }).exec(),
    ]);

    return {
      success: true,
      message: `Batch "${batchName}" deleted successfully`,
      id: batchId,
      name: batchName,
    };
  }
}
