import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();

const mockStartWorkflowRun = vi.fn();
const mockCreateStep = vi.fn();
const mockCompleteStep = vi.fn();
const mockFailStep = vi.fn();
const mockCompleteRun = vi.fn();
const mockFailRun = vi.fn();

const mockFetchLead = vi.fn();
const mockGetCrmAdapter = vi.fn();
const mockDecrypt = vi.fn();

vi.mock('../../src/services/workflow-runtime.js', () => ({
  startWorkflowRun: mockStartWorkflowRun,
  createStep: mockCreateStep,
  completeStep: mockCompleteStep,
  failStep: mockFailStep,
  completeRun: mockCompleteRun,
  failRun: mockFailRun,
}));

vi.mock('../../src/services/facebook.js', () => ({
  fetchLead: mockFetchLead,
}));

vi.mock('../../src/services/crm-adapter.js', () => ({
  getCrmAdapter: mockGetCrmAdapter,
}));

vi.mock('../../src/config/encryption.js', () => ({
  decrypt: mockDecrypt,
}));

const { dispatchPublishedWorkflow } = await import('../../src/services/workflow-dispatch.js');

describe('dispatchPublishedWorkflow', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockStartWorkflowRun.mockReset();
    mockCreateStep.mockReset();
    mockCompleteStep.mockReset();
    mockFailStep.mockReset();
    mockCompleteRun.mockReset();
    mockFailRun.mockReset();
    mockFetchLead.mockReset();
    mockGetCrmAdapter.mockReset();
    mockDecrypt.mockReset();
  });

  it('executes action and persists completed steps', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'int-1',
        user_id: 'user-1',
        source_page_access_token: 'enc-page-token',
        dest_type: 'bitrix24',
        dest_credentials: 'enc-creds',
        field_mapping: { full_name: 'name' },
      }],
    });

    mockStartWorkflowRun.mockResolvedValueOnce({ runId: 'run-1', triggerStepId: 'step-trigger' });
    mockDecrypt
      .mockReturnValueOnce('page-token')
      .mockReturnValueOnce('crm-creds');
    mockFetchLead.mockResolvedValueOnce({
      id: 'lead-1',
      name: 'Lead 1',
      phone: '+998900000000',
      email: 'lead@example.com',
      rawFields: { full_name: 'Lead 1' },
      adId: null,
      adName: null,
      formId: 'form-1',
      pageId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    mockCreateStep.mockResolvedValueOnce('step-action');
    mockGetCrmAdapter.mockResolvedValueOnce({
      deliver: vi.fn().mockResolvedValue({ crmLeadId: 123, crmType: 'bitrix24', success: true }),
    });

    const result = await dispatchPublishedWorkflow({
      pool: { query: mockQuery } as unknown as import('pg').Pool,
      userId: 'user-1',
      workflowId: 'wf-1',
      workflowVersionId: 'wv-1',
      definition: { actions: [{ type: 'bitrix24.create_lead' }] },
      sourceConfig: { integration_id: 'int-1' },
      triggerEventId: 'leadgen-1',
      sourceRef: 'page-1',
      context: { test: true },
    });

    expect(result).toEqual({ runId: 'run-1', status: 'completed', stepsExecuted: 2 });
    expect(mockCompleteStep).toHaveBeenCalledTimes(2);
    expect(mockCompleteRun).toHaveBeenCalledWith(expect.anything(), 'run-1');
    expect(mockFailRun).not.toHaveBeenCalled();
  });

  it('fails run and action step when adapter delivery throws', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'int-1',
        user_id: 'user-1',
        source_page_access_token: 'enc-page-token',
        dest_type: 'bitrix24',
        dest_credentials: 'enc-creds',
        field_mapping: {},
      }],
    });

    mockStartWorkflowRun.mockResolvedValueOnce({ runId: 'run-2', triggerStepId: 'step-trigger-2' });
    mockDecrypt
      .mockReturnValueOnce('page-token')
      .mockReturnValueOnce('crm-creds');
    mockFetchLead.mockResolvedValueOnce({
      id: 'lead-2',
      name: '',
      phone: '',
      email: '',
      rawFields: {},
      adId: null,
      adName: null,
      formId: null,
      pageId: 'page-2',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    mockCreateStep.mockResolvedValueOnce('step-action-2');
    mockGetCrmAdapter.mockResolvedValueOnce({
      deliver: vi.fn().mockRejectedValue(new Error('CRM down')),
    });

    await expect(dispatchPublishedWorkflow({
      pool: { query: mockQuery } as unknown as import('pg').Pool,
      userId: 'user-1',
      workflowId: 'wf-2',
      workflowVersionId: 'wv-2',
      definition: { actions: [{ type: 'bitrix24.create_lead' }] },
      sourceConfig: { integration_id: 'int-1' },
      triggerEventId: 'leadgen-2',
      sourceRef: 'page-2',
      context: {},
    })).rejects.toThrow('CRM down');

    expect(mockFailStep).toHaveBeenCalledWith(expect.anything(), 'step-action-2', 'CRM down');
    expect(mockFailRun).toHaveBeenCalledWith(expect.anything(), 'run-2', 'CRM down');
  });
});
