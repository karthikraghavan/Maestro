import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('App', () => {
  it('renders the governance console heading', () => {
    render(<App />);
    expect(screen.getByText('SDLC Governance Console')).toBeTruthy();
  });

  it('renders the dashboard and mailbox flow for the UX update', () => {
    render(<App />);
    expect(screen.getByText('Projects dashboard')).toBeTruthy();
    expect(screen.getByRole('button', { name: /approval mailbox/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /overview/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /agent registry/i })).toBeTruthy();
  });

  it('opens the new project charter from the left navigation', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /new project/i }));
    expect(screen.getByText('New project charter')).toBeTruthy();
    expect(screen.getByLabelText(/project name/i)).toBeTruthy();
  });

  it('updates a draft project to validated immediately after approval', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/api/projects/p-1/approval')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ approved: true, approver: 'governance-console', decision: 'approved', status: 'validated' }),
        });
      }
      if (url.includes('/api/projects')) {
        return Promise.resolve({
          ok: true,
          json: async () => [{ id: 'p-1', name: 'Budget Guard', owner: 'exec-team', status: 'draft', budget: 25000, approval: null }],
        });
      }
      if (url.includes('/api/agents')) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (url.includes('/api/integrations')) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (url.includes('/api/observability/overview')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'healthy', trace_id: 'trace-live', alerts: 0, uptime: '99.9%', services: [] }) });
      }
      if (url.includes('/api/runtime/config')) {
        return Promise.resolve({ ok: true, json: async () => ({ environment: 'local', mode: 'real', db_path: '/data/orchestrator.db', containerized: true, secret_configured: false, ready: true }) });
      }
      if (url.includes('/api/deployment/status')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'ready', environment: 'local', containerized: true, database_ready: true, secrets_configured: false, last_verified: '2026-11-11T00:00:00Z' }) });
      }
      return Promise.reject(new Error('Unexpected URL'));
    });

    vi.stubGlobal('fetch', fetchMock);
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /approval mailbox/i }));
    fireEvent.click(await screen.findByRole('button', { name: /approve/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/api/projects/p-1/approval',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('creates a project via the orchestrator before it can be approved', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/api/projects') && !url.includes('/approval')) {
        if (url.endsWith('/api/projects')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ id: 'p-100', name: 'Atlas Launch', owner: 'exec-team', status: 'draft', budget: 25000, description: 'Launch' }),
          });
        }
      }

      if (url.includes('/api/agents')) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (url.includes('/api/integrations')) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (url.includes('/api/observability/overview')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'healthy', trace_id: 'trace-live', alerts: 0, uptime: '99.9%', services: [] }) });
      }
      if (url.includes('/api/runtime/config')) {
        return Promise.resolve({ ok: true, json: async () => ({ environment: 'local', mode: 'real', db_path: '/data/orchestrator.db', containerized: true, secret_configured: false, ready: true }) });
      }
      if (url.includes('/api/deployment/status')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'ready', environment: 'local', containerized: true, database_ready: true, secrets_configured: false, last_verified: '2026-11-11T00:00:00Z' }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    vi.stubGlobal('fetch', fetchMock);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /new project/i }));
    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: 'Atlas Launch' } });
    fireEvent.change(screen.getByDisplayValue('platform-team'), { target: { value: 'exec-team' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.change(screen.getByLabelText(/business objective/i), { target: { value: 'Launch with governance' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.change(screen.getByLabelText(/problem statement/i), { target: { value: 'We need better intake governance.' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.change(screen.getByLabelText(/new repo name/i), { target: { value: 'ATLAS-REPO' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.change(screen.getByLabelText(/total amount/i), { target: { value: '25000' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.change(screen.getByLabelText(/target release date/i), { target: { value: '2027-01-15' } });
    fireEvent.click(screen.getByRole('button', { name: /review/i }));
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/api/projects',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('registers a running agent by URL from the registry screen', async () => {
    const card = {
      name: 'Business Analyst Agent',
      description: 'Elicits process flows.',
      version: '0.1.0',
      url: 'http://ba-agent:8104',
      healthy: true,
      max_instances: 1,
      skills: [{ id: 'process.model', name: 'Process Model', description: '' }],
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.includes('/api/projects')) {
          return Promise.resolve({ ok: true, json: async () => [] });
        }
        if (url.endsWith('/api/agents/preview')) {
          return Promise.resolve({ ok: true, json: async () => card });
        }
        if (url.endsWith('/api/agents') && init?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              id: 'business_analyst_agent', name: card.name, role: card.description, version: '0.1.0',
              url: card.url, skills: ['process.model'], autonomy: 'L1', status: 'online', instances: 1, max_instances: 1,
            }),
          });
        }
        if (url.includes('/api/agents')) {
          return Promise.resolve({
            ok: true,
            json: async () => [{ id: 'sdlc_orchestrator', name: 'SDLC Orchestrator', status: 'online', autonomy: 'L0', skills: ['task.route'], system: true }],
          });
        }
        if (url.includes('/api/integrations')) {
          return Promise.resolve({ ok: true, json: async () => [] });
        }
        if (url.includes('/api/observability/overview')) {
          return Promise.resolve({ ok: true, json: async () => ({ status: 'healthy', trace_id: 'trace-live', alerts: 0, uptime: '99.9%', services: [] }) });
        }
        if (url.includes('/api/runtime/config')) {
          return Promise.resolve({ ok: true, json: async () => ({ environment: 'local', mode: 'real', db_path: '/data/orchestrator.db', containerized: true, secret_configured: false, ready: true }) });
        }
        if (url.includes('/api/deployment/status')) {
          return Promise.resolve({ ok: true, json: async () => ({ status: 'ready', environment: 'local', containerized: true, database_ready: true, secrets_configured: false, last_verified: '2026-11-11T00:00:00Z' }) });
        }
        return Promise.reject(new Error('Unexpected URL'));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /agent registry/i }));
    expect(await screen.findByText('SDLC Orchestrator')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /onboard agent/i }));

    fireEvent.change(screen.getByLabelText(/agent url/i), { target: { value: 'http://ba-agent:8104' } });
    fireEvent.click(screen.getByRole('button', { name: /fetch card/i }));
    expect(await screen.findByText('Business Analyst Agent')).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/autonomy level/i), { target: { value: 'L2' } });
    fireEvent.click(screen.getByRole('button', { name: /register agent/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /register an agent/i })).toBeNull();
    });
    expect(screen.getByText(/Elicits process flows/)).toBeTruthy();

    const registerCall = fetchMock.mock.calls.find(
      ([input, init]) => String(input).endsWith('/api/agents') && init?.method === 'POST',
    );
    expect(JSON.parse(String(registerCall?.[1]?.body))).toMatchObject({ url: 'http://ba-agent:8104', autonomy: 'L2', instances: 1 });
  });

  it('uses the live empty state when the backend has no projects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('/api/projects')) {
          return Promise.resolve({ ok: true, json: async () => [] });
        }
        if (url.includes('/api/agents')) {
          return Promise.resolve({ ok: true, json: async () => [] });
        }
        if (url.includes('/api/integrations')) {
          return Promise.resolve({ ok: true, json: async () => [] });
        }
        if (url.includes('/api/observability/overview')) {
          return Promise.resolve({ ok: true, json: async () => ({ status: 'healthy', trace_id: 'trace-live', alerts: 0, uptime: '99.9%', services: [] }) });
        }
        if (url.includes('/api/runtime/config')) {
          return Promise.resolve({ ok: true, json: async () => ({ environment: 'local', mode: 'real', db_path: '/data/orchestrator.db', containerized: true, secret_configured: false, ready: true }) });
        }
        if (url.includes('/api/deployment/status')) {
          return Promise.resolve({ ok: true, json: async () => ({ status: 'ready', environment: 'local', containerized: true, database_ready: true, secrets_configured: false, last_verified: '2026-11-11T00:00:00Z' }) });
        }
        return Promise.reject(new Error('Unexpected URL'));
      }),
    );

    render(<App />);

    expect(await screen.findByText('No projects yet.')).toBeTruthy();
    expect(screen.queryByText('AI Sprint Planner')).toBeNull();
  });
});
