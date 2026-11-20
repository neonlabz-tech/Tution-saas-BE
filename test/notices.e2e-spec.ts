import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RolesGuard } from '../src/auth/guards/roles.guard.js';
import {
  AllExceptionsFilter,
  HttpExceptionFilter,
} from '../src/common/filters/index.js';
import { ResponseInterceptor } from '../src/common/interceptors/index.js';
import { NoticesController } from '../src/notices/notices.controller.js';
import { NoticesService } from '../src/notices/notices.service.js';
import { Notice } from '../src/notices/schemas/notice.schema.js';
import { Counter } from '../src/students/schemas/counter.schema.js';

/* ------------------------------------------------------------------ */
/* Tiny in-memory Mongo stand-in covering the operators NoticesService */
/* uses ($and, $or, $gt/$gte/$lt/$lte, $size, regex, array contains).  */
/* ------------------------------------------------------------------ */
type Doc = Record<string, any>;

function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === '$and') return (cond as Doc[]).every((f) => matches(doc, f));
    if (key === '$or') return (cond as Doc[]).some((f) => matches(doc, f));
    const value = doc[key];
    if (cond instanceof RegExp) return typeof value === 'string' && cond.test(value);
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      return Object.entries(cond as Doc).every(([op, arg]) => {
        switch (op) {
          case '$gt': return value > arg;
          case '$gte': return value >= arg;
          case '$lt': return value < arg;
          case '$lte': return value <= arg;
          case '$size': return Array.isArray(value) && value.length === arg;
          default: throw new Error(`Unsupported operator ${op}`);
        }
      });
    }
    if (Array.isArray(value)) return value.includes(cond);
    return value === cond;
  });
}

function createNoticeStore() {
  let docs: Doc[] = [];
  const clone = (d: Doc) => structuredClone(d);
  const query = (result: () => any) => {
    const q: any = {
      sort: (spec: Record<string, 1 | -1>) => {
        const prev = result;
        result = () =>
          [...prev()].sort((a: Doc, b: Doc) => {
            for (const [k, dir] of Object.entries(spec)) {
              if (a[k] < b[k]) return -dir;
              if (a[k] > b[k]) return dir;
            }
            return 0;
          });
        return q;
      },
      lean: () => q,
      exec: async () => result(),
    };
    return q;
  };
  const hydrate = (raw: Doc) => {
    const d: Doc = clone(raw);
    d.toObject = () => {
      const { toObject: _t, save: _s, ...rest } = d;
      return clone(rest);
    };
    d.save = async () => {
      const plain = d.toObject();
      plain.updatedAt = new Date();
      docs = docs.map((x) => (x.id === plain.id ? plain : x));
      return hydrate(plain);
    };
    return d;
  };

  return {
    reset: (seed: Doc[] = []) => { docs = seed.map(clone); },
    all: () => docs,
    model: {
      createIndexes: vi.fn().mockResolvedValue(undefined),
      find: vi.fn((f: Doc = {}) => query(() => docs.filter((d) => matches(d, f)).map(clone))),
      findOne: vi.fn((f: Doc) => {
        const q = query(() => {
          const found = docs.find((d) => matches(d, f));
          return found ? clone(found) : null;
        });
        // non-lean path: findOne().exec() returns a hydrated doc
        const leanExec = q.exec;
        let isLean = false;
        q.lean = () => { isLean = true; return q; };
        q.exec = async () => {
          const r = await leanExec();
          return r && !isLean ? hydrate(r) : r;
        };
        return q;
      }),
      countDocuments: vi.fn((f: Doc = {}) => query(() => docs.filter((d) => matches(d, f)).length)),
      create: vi.fn(async (payload: Doc) => {
        const now = new Date();
        const doc = { ...payload, createdAt: now, updatedAt: now };
        docs.push(clone(doc));
        return hydrate(doc);
      }),
      deleteOne: vi.fn((f: Doc) =>
        query(() => {
          const before = docs.length;
          docs = docs.filter((d) => !matches(d, f));
          return { deletedCount: before - docs.length };
        }),
      ),
    },
  };
}

function createCounterModel() {
  let seq = 0;
  return {
    reset: () => { seq = 0; },
    model: {
      findOneAndUpdate: vi.fn(() => ({
        lean: function () { return this; },
        exec: async () => ({ _id: 'notice', seq: ++seq }),
      })),
    },
  };
}

/** Stands in for JwtAuthGuard: role comes from the x-test-role header. */
class FakeAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const role = req.headers['x-test-role'];
    if (role) req.user = { sub: 'USR-001', email: 't@test.lk', fullName: 'Tester', role };
    return true;
  }
}

/* ------------------------------------------------------------------ */

describe('Notices API (e2e, in-memory DB)', () => {
  let app: INestApplication;
  const store = createNoticeStore();
  const counter = createCounterModel();
  const http = () => request(app.getHttpServer());
  const asAdmin = { 'x-test-role': 'admin' };
  const asStudent = { 'x-test-role': 'student' };

  // Fixed "today" so states are deterministic.
  const TODAY = '2026-11-20';

  const body = (over: Doc = {}) => ({
    title: 'Holiday notice',
    description: 'Institute closed on Monday for Deepavali.',
    allBatches: true,
    publishDate: TODAY,
    expiryDate: '2026-11-27',
    priority: 'high',
    status: 'published',
    ...over,
  });

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 20, 10, 0, 0));

    const moduleRef = await Test.createTestingModule({
      controllers: [NoticesController],
      providers: [
        NoticesService,
        Reflector,
        { provide: getModelToken(Notice.name), useValue: store.model },
        { provide: getModelToken(Counter.name), useValue: counter.model },
        { provide: APP_GUARD, useClass: FakeAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter(), new AllExceptionsFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    vi.useRealTimers();
  });

  beforeEach(() => {
    store.reset();
    counter.reset();
  });

  /* ---------------- Create ---------------- */

  it('POST creates notice with NTC-001 id, wrapped in ApiResponse', async () => {
    const res = await http().post('/api/notices').set(asAdmin).send(body());

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      id: 'NTC-001',
      allBatches: true,
      batches: [],
      state: 'active',
      priority: 'high',
    });

    const second = await http().post('/api/notices').set(asAdmin).send(body());
    expect(second.body.data.id).toBe('NTC-002');
  });

  it('POST trims strings and applies defaults', async () => {
    const res = await http()
      .post('/api/notices')
      .set(asAdmin)
      .send({
        title: '  Exam timetable  ',
        description: '  Final exams start next week.  ',
        batches: [' 2025-A Morning '],
        publishDate: TODAY,
        expiryDate: '2026-11-30',
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      title: 'Exam timetable',
      description: 'Final exams start next week.',
      allBatches: false,
      batches: ['2025-A Morning'],
      priority: 'medium',
      status: 'published',
    });
  });

  it.each([
    ['bad date format', { publishDate: '20-11-2026' }, 'Publish date must be in YYYY-MM-DD format'],
    ['impossible date', { expiryDate: '2026-02-31' }, 'Expiry date is not a valid calendar date'],
    ['expiry before publish', { publishDate: '2026-11-25', expiryDate: '2026-11-22' }, 'Expiry date must be on or after the publish date'],
    ['publish date in the past', { publishDate: '2026-11-19', expiryDate: '2026-11-25' }, 'Publish date cannot be in the past'],
    ['no batches selected', { allBatches: false, batches: [] }, 'Select at least one batch'],
    ['short title', { title: 'Hi' }, 'Title must be at least 4 characters'],
    ['bad priority', { priority: 'urgent' }, 'Priority must be low, medium, or high'],
    ['unknown field', { createdBy: 'hacker' }, 'createdBy'],
  ])('POST rejects %s with 400', async (_name, over, message) => {
    const res = await http().post('/api/notices').set(asAdmin).send(body(over));

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(JSON.stringify(res.body)).toContain(message);
    expect(store.all()).toHaveLength(0);
  });

  /* ---------------- Roles ---------------- */

  it.each(['student', 'teacher'])('POST/PATCH/DELETE are forbidden for %s', async (role) => {
    await http().post('/api/notices').set(asAdmin).send(body());
    const headers = { 'x-test-role': role };

    expect((await http().post('/api/notices').set(headers).send(body())).status).toBe(403);
    expect((await http().patch('/api/notices/NTC-001').set(headers).send({ title: 'Changed' })).status).toBe(403);
    expect((await http().delete('/api/notices/NTC-001').set(headers)).status).toBe(403);
    expect(store.all()).toHaveLength(1);
  });

  it('super_admin can create', async () => {
    const res = await http().post('/api/notices').set({ 'x-test-role': 'super_admin' }).send(body());
    expect(res.status).toBe(201);
  });

  /* ---------------- List, filters, counts ---------------- */

  const seedStates = async () => {
    const mk = (over: Doc) => http().post('/api/notices').set(asAdmin).send(body(over));
    await mk({ title: 'Active all batches' }); // NTC-001 active
    await mk({ title: 'Active morning', allBatches: false, batches: ['2025-A Morning'], priority: 'low' }); // NTC-002
    await mk({ title: 'Scheduled evening', allBatches: false, batches: ['2025-B Evening'], publishDate: '2026-11-25', expiryDate: '2026-11-30' }); // NTC-003
    await mk({ title: 'Draft notice', status: 'draft' }); // NTC-004
    // expired notices can't be created via API (past expiry) → seed directly
    store.all().push({
      id: 'NTC-005', title: 'Expired fee reminder', description: 'Pay fees before deadline.',
      allBatches: false, batches: ['2025-A Morning'], publishDate: '2026-11-01',
      expiryDate: '2026-11-10', priority: 'medium', status: 'published',
    });
    // legacy doc: no allBatches field, empty batches
    store.all().push({
      id: 'NTC-006', title: 'Legacy notice', description: 'Old notice from before allBatches.',
      batches: [], publishDate: '2026-11-15', expiryDate: '2026-11-29', priority: 'low', status: 'published',
    });
  };

  it('GET returns items sorted by publishDate desc with state and counts (admins also see expired)', async () => {
    await seedStates();
    const res = await http().get('/api/notices').set(asAdmin);

    expect(res.status).toBe(200);
    const { items, counts } = res.body.data;
    expect(items).toHaveLength(6);
    expect(items[0].id).toBe('NTC-003'); // latest publishDate
    expect(Object.fromEntries(items.map((n: Doc) => [n.id, n.state]))).toEqual({
      'NTC-001': 'active', 'NTC-002': 'active', 'NTC-003': 'scheduled',
      'NTC-004': 'draft', 'NTC-005': 'expired', 'NTC-006': 'active',
    });
    expect(counts).toEqual({ all: 6, active: 3, scheduled: 1, draft: 1 });
    expect(items.find((n: Doc) => n.id === 'NTC-006').allBatches).toBe(true);
  });

  it('GET filters by state but counts stay global', async () => {
    await seedStates();
    const res = await http().get('/api/notices?state=scheduled').set(asAdmin);

    expect(res.body.data.items.map((n: Doc) => n.id)).toEqual(['NTC-003']);
    expect(res.body.data.counts.all).toBe(6);
  });

  it('GET batch filter includes all-batches notices', async () => {
    await seedStates();
    const res = await http().get('/api/notices?batch=2025-A%20Morning').set(asAdmin);
    expect(res.body.data.items.map((n: Doc) => n.id).sort()).toEqual(
      ['NTC-001', 'NTC-002', 'NTC-004', 'NTC-005', 'NTC-006'],
    );
  });


  it('GET search (q) is case-insensitive and regex-safe; priority filter works', async () => {
    await seedStates();
    const byQ = await http().get('/api/notices?q=MORNING').set(asAdmin);
    expect(byQ.body.data.items.map((n: Doc) => n.id)).toEqual(['NTC-002']);

    // admins can still search expired notices
    const expired = await http().get('/api/notices?q=fee').set(asAdmin);
    expect(expired.body.data.items.map((n: Doc) => n.id)).toEqual(['NTC-005']);

    const weird = await http().get('/api/notices?q=(.*').set(asAdmin);
    expect(weird.status).toBe(200);
    expect(weird.body.data.items).toHaveLength(0);

    const byPriority = await http().get('/api/notices?priority=low').set(asAdmin);
    expect(byPriority.body.data.items.map((n: Doc) => n.id).sort()).toEqual(['NTC-002', 'NTC-006']);
  });

  it('GET treats state=all / empty as no filter and rejects bad state', async () => {
    await seedStates();
    expect((await http().get('/api/notices?state=all').set(asAdmin)).body.data.items).toHaveLength(6);
    expect((await http().get('/api/notices?state=bogus').set(asAdmin)).status).toBe(400);
    expect((await http().get('/api/notices?state=expired').set(asAdmin)).status).toBe(400);
  });

  it('student only sees active notices, even if asking for drafts', async () => {
    await seedStates();
    const res = await http().get('/api/notices?state=draft').set(asStudent);

    expect(res.status).toBe(200);
    expect(res.body.data.items.map((n: Doc) => n.id).sort()).toEqual(['NTC-001', 'NTC-002', 'NTC-006']);
    expect(res.body.data.counts).toEqual({ all: 3, active: 3, scheduled: 0, draft: 0 });
  });

  /* ---------------- Single ---------------- */

  it('GET /:id returns notice; 404 when missing; student cannot open draft', async () => {
    await seedStates();
    const ok = await http().get('/api/notices/NTC-002').set(asAdmin);
    expect(ok.status).toBe(200);
    expect(ok.body.data.title).toBe('Active morning');

    expect((await http().get('/api/notices/NTC-999').set(asAdmin)).status).toBe(404);
    expect((await http().get('/api/notices/NTC-004').set(asAdmin)).status).toBe(200);
    expect((await http().get('/api/notices/NTC-004').set(asStudent)).status).toBe(404);
    // expired: admins can open it, students cannot
    expect((await http().get('/api/notices/NTC-005').set(asAdmin)).status).toBe(200);
    expect((await http().get('/api/notices/NTC-005').set(asStudent)).status).toBe(404);
  });

  /* ---------------- Update ---------------- */

  it('PATCH updates fields and switches targeting', async () => {
    await http().post('/api/notices').set(asAdmin).send(body());

    const toBatches = await http()
      .patch('/api/notices/NTC-001')
      .set(asAdmin)
      .send({ title: 'Updated title', batches: ['2025-B Evening'] });
    expect(toBatches.status).toBe(200);
    expect(toBatches.body.data).toMatchObject({
      title: 'Updated title', allBatches: false, batches: ['2025-B Evening'],
    });

    const toAll = await http().patch('/api/notices/NTC-001').set(asAdmin).send({ allBatches: true });
    expect(toAll.body.data).toMatchObject({ allBatches: true, batches: [] });

    const toDraft = await http().patch('/api/notices/NTC-001').set(asAdmin).send({ status: 'draft' });
    expect(toDraft.body.data.state).toBe('draft');
    expect(store.all()[0].status).toBe('draft');
  });

  it('PATCH accepts the full FE payload (same shape as create)', async () => {
    await http().post('/api/notices').set(asAdmin).send(body());
    const res = await http()
      .patch('/api/notices/NTC-001')
      .set(asAdmin)
      .send(body({ title: 'From the edit form', allBatches: false, batches: ['2025-A Morning'] }));
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('From the edit form');
  });

  it('PATCH keeps an existing past publish date but blocks moving to a past date', async () => {
    store.all().push({
      id: 'NTC-050', title: 'Live notice', description: 'Already published last week.',
      allBatches: true, batches: [], publishDate: '2026-11-13', expiryDate: '2026-11-30',
      priority: 'medium', status: 'published',
    });

    const keep = await http()
      .patch('/api/notices/NTC-050')
      .set(asAdmin)
      .send(body({ title: 'Live notice edited', publishDate: '2026-11-13', expiryDate: '2026-11-30' }));
    expect(keep.status).toBe(200);

    const move = await http().patch('/api/notices/NTC-050').set(asAdmin).send({ publishDate: '2026-11-10' });
    expect(move.status).toBe(400);
    expect(JSON.stringify(move.body)).toContain('Publish date cannot be in the past');
  });

  it('PATCH validates merged dates and 404s on missing', async () => {
    await http().post('/api/notices').set(asAdmin).send(body());

    const bad = await http().patch('/api/notices/NTC-001').set(asAdmin).send({ publishDate: '2026-12-15' });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).toContain('Expiry date must be on or after the publish date');

    const unTarget = await http().patch('/api/notices/NTC-001').set(asAdmin).send({ allBatches: false });
    expect(unTarget.status).toBe(400);

    expect((await http().patch('/api/notices/NTC-404').set(asAdmin).send({ title: 'Nope nope' })).status).toBe(404);
  });

  /* ---------------- Delete ---------------- */

  it('DELETE hard-deletes and then 404s', async () => {
    await http().post('/api/notices').set(asAdmin).send(body());

    const res = await http().delete('/api/notices/NTC-001').set(asAdmin);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deleted: true, id: 'NTC-001' });
    expect(store.all()).toHaveLength(0);

    expect((await http().delete('/api/notices/NTC-001').set(asAdmin)).status).toBe(404);
  });
});
