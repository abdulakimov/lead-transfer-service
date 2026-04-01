import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { testRequest } from '../helpers/http.js';

const mockQuery = vi.fn();
const addLeadJobMock = vi.fn();
const getJobMock = vi.fn();
const removeJobMock = vi.fn();

vi.mock('../../src/middleware/auth.js', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as express.Request & { user?: { userId: string; email: string } }).user = {
      userId: 'user-1',
      email: 'user@example.com',
    };
    next();
  },
}));

vi.mock('../../src/db/pool.js', () => ({
  getPool: () => ({ query: mockQuery }),
}));

vi.mock('../../src/queue/lead-queue.js', () => ({
  addLeadJob: addLeadJobMock,
  getLeadQueue: () => ({
    getJob: getJobMock,
  }),
}));

const { default: leadsRoutes } = await import('../../src/api/leads.js');
const { errorHandler } = await import('../../src/middleware/error-handler.js');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/leads', leadsRoutes);
  app.use(errorHandler);
  return app;
}

describe('Leads retry route', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    addLeadJobMock.mockReset();
    getJobMock.mockReset();
    removeJobMock.mockReset();
  });

  it('removes existing job with same deterministic jobId before requeue', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'lead-row-1', leadgen_id: 'lg-1', integration_id: 'int-1', status: 'failed' }],
      })
      .mockResolvedValueOnce({
        rows: [{ source_page_id: '1056259887566576' }],
      })
      .mockResolvedValueOnce({ rows: [] });

    getJobMock.mockResolvedValue({ remove: removeJobMock });
    addLeadJobMock.mockResolvedValue('job-1');

    const app = createApp();
    const res = await testRequest(app, 'POST', '/api/leads/lead-row-1/retry');

    expect(res.status).toBe(200);
    expect(getJobMock).toHaveBeenCalledWith('lead-lg-1');
    expect(removeJobMock).toHaveBeenCalledTimes(1);
    expect(addLeadJobMock).toHaveBeenCalledWith({
      leadgenId: 'lg-1',
      integrationId: 'int-1',
      pageId: '1056259887566576',
    });
  });

  it('requeues even when previous queue job does not exist', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'lead-row-2', leadgen_id: 'lg-2', integration_id: 'int-2', status: 'dlq' }],
      })
      .mockResolvedValueOnce({
        rows: [{ source_page_id: '1056259887566576' }],
      })
      .mockResolvedValueOnce({ rows: [] });

    getJobMock.mockResolvedValue(null);
    addLeadJobMock.mockResolvedValue('job-2');

    const app = createApp();
    const res = await testRequest(app, 'POST', '/api/leads/lead-row-2/retry');

    expect(res.status).toBe(200);
    expect(getJobMock).toHaveBeenCalledWith('lead-lg-2');
    expect(removeJobMock).not.toHaveBeenCalled();
    expect(addLeadJobMock).toHaveBeenCalledWith({
      leadgenId: 'lg-2',
      integrationId: 'int-2',
      pageId: '1056259887566576',
    });
  });
});
