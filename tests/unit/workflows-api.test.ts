import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { testRequest } from '../helpers/http.js';

const mockQuery = vi.fn();
const mockDispatchPublishedWorkflow = vi.fn();

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

vi.mock('../../src/services/workflow-dispatch.js', () => ({
  dispatchPublishedWorkflow: mockDispatchPublishedWorkflow,
}));

const { default: workflowRoutes } = await import('../../src/api/workflows.js');
const { errorHandler } = await import('../../src/middleware/error-handler.js');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/workflows', workflowRoutes);
  app.use(errorHandler);
  return app;
}

describe('Workflows API', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockDispatchPublishedWorkflow.mockReset();
  });

  it('lists runs for authenticated user', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'run-1',
            workflow_id: 'wf-1',
            workflow_name: 'Workflow 1',
            workflow_version: 1,
            status: 'completed',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ total: '1' }],
      });

    const app = createApp();
    const res = await testRequest(app, 'GET', '/api/workflows/runs?limit=10&offset=0');

    expect(res.status).toBe(200);
    expect((res.body.runs as unknown[]).length).toBe(1);
    expect(res.body.total).toBe(1);
    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FROM workflow_runs r'),
      ['user-1', 10, 0],
    );
  });

  it('returns run detail with step timeline', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'run-2',
            workflow_id: 'wf-2',
            workflow_name: 'Workflow 2',
            workflow_version: 2,
            status: 'failed',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'step-1',
            run_id: 'run-2',
            step_key: 'trigger.lead.received',
            status: 'completed',
          },
          {
            id: 'step-2',
            run_id: 'run-2',
            step_key: 'action.bitrix24.create_lead',
            status: 'failed',
          },
        ],
      });

    const app = createApp();
    const res = await testRequest(app, 'GET', '/api/workflows/runs/run-2');

    expect(res.status).toBe(200);
    expect((res.body.run as Record<string, unknown>).id).toBe('run-2');
    expect((res.body.steps as unknown[]).length).toBe(2);
    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('WHERE r.id = $1 AND w.user_id = $2'),
      ['run-2', 'user-1'],
    );
  });

  it('returns 404 when run does not belong to user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await testRequest(app, 'GET', '/api/workflows/runs/missing-run');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Workflow run topilmadi');
  });

  it('creates workflow and new draft version', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'wf-10',
            name: 'Lead to CRM',
            active: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'wf-10' }],
      })
      .mockResolvedValueOnce({
        rows: [{ max_version: '0' }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'ver-1',
            workflow_id: 'wf-10',
            version: 1,
            is_published: false,
          },
        ],
      });

    const app = createApp();
    const createRes = await testRequest(app, 'POST', '/api/workflows', {
      body: {
        name: 'Lead to CRM',
        source_type: 'lead_bridge',
        trigger_type: 'lead.received',
      },
    });
    expect(createRes.status).toBe(201);

    const versionRes = await testRequest(app, 'POST', '/api/workflows/wf-10/versions', {
      body: {
        definition: { trigger: { type: 'lead.received' }, actions: [{ type: 'bitrix24.create_lead' }] },
      },
    });
    expect(versionRes.status).toBe(201);
    expect((versionRes.body as Record<string, unknown>).version).toBe(1);
  });

  it('publishes selected version', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'wf-20' }] }) // findOwnedWorkflow
      .mockResolvedValueOnce({ rows: [{ id: 'ver-2', version: 2 }] }) // target version
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // unpublish all
      .mockResolvedValueOnce({ rows: [] }) // publish target
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const app = createApp();
    const res = await testRequest(app, 'POST', '/api/workflows/wf-20/publish', {
      body: { version_id: '6c47aa64-0bb4-47fc-af3f-c2d7fd311f7a' },
    });

    expect(res.status).toBe(200);
    expect((res.body as Record<string, unknown>).message).toBe('Workflow version publish qilindi');
  });

  it('dispatches published workflow via runtime service', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 'wf-30',
          user_id: 'user-1',
          source_type: 'lead_bridge',
          trigger_type: 'lead.received',
          source_config: { integration_id: 'int-1' },
        }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'ver-pub-1', version: 1, definition: { actions: [{ type: 'bitrix24.create_lead' }] } }],
      });

    mockDispatchPublishedWorkflow.mockResolvedValueOnce({
      runId: 'run-30',
      status: 'completed',
      stepsExecuted: 2,
    });

    const app = createApp();
    const res = await testRequest(app, 'POST', '/api/workflows/wf-30/dispatch', {
      body: {
        trigger_event_id: 'leadgen-30',
        source_ref: '1056259887566576',
        context: { test: true },
      },
    });

    expect(res.status).toBe(201);
    expect((res.body as Record<string, unknown>).message).toBe('Workflow dispatch bajarildi');
    expect(mockDispatchPublishedWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        workflowId: 'wf-30',
        workflowVersionId: 'ver-pub-1',
        triggerEventId: 'leadgen-30',
      }),
    );
  });

  it('rejects deprecated meta trigger workflow creation', async () => {
    const app = createApp();
    const res = await testRequest(app, 'POST', '/api/workflows', {
      body: {
        name: 'Old meta workflow',
        source_type: 'meta',
        trigger_type: 'meta.lead.created',
      },
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('meta.* triggerlar qo\'llab-quvvatlanmaydi');
  });
});
