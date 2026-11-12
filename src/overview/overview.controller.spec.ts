import { Test, type TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { OverviewController } from './overview.controller.js';
import { OverviewService } from './overview.service.js';

describe('OverviewController', () => {
  let controller: OverviewController;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    service = {
      getOverview: vi.fn(),
      getKpisAndTrends: vi.fn(),
      getActivityFeeds: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OverviewController],
      providers: [{ provide: OverviewService, useValue: service }],
    }).compile();

    controller = module.get<OverviewController>(OverviewController);
  });

  it('delegates overview endpoints to OverviewService', async () => {
    const ov = { summary: {}, kpis: {}, trends: {}, activityFeeds: {} };
    const kt = { summary: {}, kpis: {}, trends: {} };
    const af = { upcomingClasses: [] };
    service.getOverview.mockResolvedValue(ov);
    service.getKpisAndTrends.mockResolvedValue(kt);
    service.getActivityFeeds.mockResolvedValue(af);

    expect(await controller.getOverview()).toBe(ov);
    expect(await controller.getKpisAndTrends()).toBe(kt);
    expect(await controller.getActivityFeeds()).toBe(af);
  });
});
