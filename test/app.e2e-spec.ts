import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  }, 30_000);

  it('/ (GET)', async () => {
    const res = await request(app.getHttpServer()).get('/').expect(200);
    expect(res.body).toMatchObject({
      success: true,
      data: 'Hello World!',
    });
  });

  afterEach(async () => {
    await app?.close();
  });
});
