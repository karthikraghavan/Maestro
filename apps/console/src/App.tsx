import { useEffect, useRef, useState } from 'react';

type Project = {
  id: string;
  name: string;
  owner: string;
  status: string;
  budget?: number | null;
  description?: string;
  approval?: { approved?: boolean; approver?: string; decision?: string } | null;
};

type Agent = {
  id?: string;
  name: string;
  status: string;
  autonomy: string;
  role?: string;
  version?: string;
  url?: string;
  skills?: string[];
  tools?: string[];
  instances?: number;
  max_instances?: number;
  system?: boolean;
};

type AgentCardPreview = {
  name: string;
  description: string;
  version: string;
  url: string;
  healthy: boolean;
  max_instances: number;
  skills: Array<{ id: string; name: string; description: string }>;
};

type Integration = {
  name: string;
  status: string;
  kind: string;
  owner: string;
};

type Observability = {
  status: string;
  trace_id: string;
  alerts: number;
  uptime: string;
  services: Array<{ name: string; status: string; latency_ms: number }>;
};

type RuntimeConfig = {
  environment: string;
  mode: string;
  db_path: string;
  containerized: boolean;
  secret_configured: boolean;
  ready: boolean;
};

type DeploymentStatus = {
  status: string;
  environment: string;
  containerized: boolean;
  database_ready: boolean;
  secrets_configured: boolean;
  last_verified: string;
};

type KpiRow = {
  kpi: string;
  unit: string;
  direction: string;
  baseline: string;
  target: string;
  measureBy: string;
  dataSource: string;
};

type SourceMaterialRow = {
  url: string;
  documentType: string;
  owner: string;
};

type DependencyRow = {
  name: string;
  type: string;
};

type DraftProject = {
  name: string;
  shortCode: string;
  owner: string;
  sponsorTitle: string;
  lineOfBusiness: string;
  businessOwnerSameAsSponsor: boolean;
  businessOwner: string;
  businessObjective: string;
  objective: string;
  kpis: KpiRow[];
  successCriteria: string;
  problemStatement: string;
  affectedUsers: string;
  inScope: string;
  outOfScope: string;
  assumptions: string;
  dependencies: DependencyRow[];
  scope: string;
  sourceMaterial: string;
  documentLinks: SourceMaterialRow[];
  repository: string;
  repositoryType: string;
  repoUrl: string;
  newRepoName: string;
  techStack: string;
  constraints: string;
  dataClassification: string;
  totalAmount: string;
  currency: string;
  fundingPeriod: string;
  costCenter: string;
  budget: string;
  releaseDate: string;
  priority: string;
  approvers: string;
  autonomyLevel: string;
  accessNeeded: string;
  targetReleaseDate: string;
};

type AgentDraft = {
  url: string;
  autonomy: string;
  tools: string;
  instances: string;
};

const emptyAgentDraft: AgentDraft = { url: '', autonomy: 'L1', tools: '', instances: '1' };

const readErrorMessage = async (response: Response, fallback: string) => {
  const payload = await response.json().catch(() => ({}));
  return payload?.detail?.message || payload?.message || fallback;
};

type CharterChecklistId =
  | 'project-name-sponsor'
  | 'objective-kpis'
  | 'problem-scope'
  | 'source-material'
  | 'repository-stack'
  | 'constraints-data'
  | 'budget-requested'
  | 'release-priority'
  | 'approvers'
  | 'autonomy-level'
  | 'access-needed';

type PermissionKey = 'repo' | 'secrets' | 'observability' | 'deployments' | 'data';

const defaultPermissions: Record<PermissionKey, boolean> = {
  repo: true,
  secrets: false,
  observability: true,
  deployments: false,
  data: true,
};

const charterChecklist: Array<{ id: CharterChecklistId; label: string }> = [
  { id: 'project-name-sponsor', label: 'Project name and sponsor' },
  { id: 'objective-kpis', label: 'Objective and KPIs' },
  { id: 'problem-scope', label: 'Problem and scope' },
  { id: 'source-material', label: 'Source material' },
  { id: 'repository-stack', label: 'Repository' },
  { id: 'budget-requested', label: 'Budget requested' },
  { id: 'release-priority', label: 'Release date and priority' },
];

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [observability, setObservability] = useState<Observability | null>(null);
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig | null>(null);
  const [deploymentStatus, setDeploymentStatus] = useState<DeploymentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateProjectForm, setShowCreateProjectForm] = useState(false);
  const [activeView, setActiveView] = useState<'overview' | 'agent-registry' | 'approvals' | 'new-project'>('overview');
  const [charterStep, setCharterStep] = useState<CharterChecklistId>('project-name-sponsor');
  const [completedCharterItems, setCompletedCharterItems] = useState<CharterChecklistId[]>([]);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [draftProject, setDraftProject] = useState<DraftProject>({
    name: '',
    shortCode: '',
    owner: 'platform-team',
    sponsorTitle: '',
    lineOfBusiness: 'Technology & Operations',
    businessOwnerSameAsSponsor: true,
    businessOwner: '',
    businessObjective: '',
    objective: '',
    kpis: [
      { kpi: '', unit: '%', direction: 'Increase', baseline: '', target: '', measureBy: '', dataSource: '' },
      { kpi: '', unit: '%', direction: 'Increase', baseline: '', target: '', measureBy: '', dataSource: '' },
    ],
    successCriteria: '',
    problemStatement: '',
    affectedUsers: '',
    inScope: '',
    outOfScope: '',
    assumptions: '',
    dependencies: [{ name: '', type: 'Team' }],
    scope: '',
    sourceMaterial: '',
    documentLinks: [{ url: '', documentType: 'BRD', owner: 'platform-team' }],
    repository: '',
    repositoryType: 'new',
    repoUrl: '',
    newRepoName: '',
    techStack: '',
    constraints: '',
    dataClassification: 'internal',
    totalAmount: '',
    currency: 'USD',
    fundingPeriod: 'Project lifetime',
    costCenter: '',
    budget: '15000',
    releaseDate: '',
    priority: 'medium',
    approvers: '',
    autonomyLevel: 'medium',
    accessNeeded: '',
    targetReleaseDate: '',
  });
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isOnboardingAgent, setIsOnboardingAgent] = useState(false);
  const [agentDraft, setAgentDraft] = useState<AgentDraft>(emptyAgentDraft);
  const [agentPreview, setAgentPreview] = useState<AgentCardPreview | null>(null);
  const [agentFormError, setAgentFormError] = useState<string | null>(null);
  const [toolAccessOpen, setToolAccessOpen] = useState(false);
  const [permissions, setPermissions] = useState<Record<PermissionKey, boolean>>(defaultPermissions);
  const fallbackProjectsRef = useRef<Project[]>([]);

  useEffect(() => {
    const savedProjects = (() => {
      try {
        const raw = localStorage.getItem('sdlc-governance-projects');
        return raw ? JSON.parse(raw) as Project[] : [];
      } catch {
        return [] as Project[];
      }
    })();

    fallbackProjectsRef.current = savedProjects;
    if (savedProjects.length) {
      setProjects(savedProjects);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && projects.length) {
      window.localStorage.setItem('sdlc-governance-projects', JSON.stringify(projects));
    }
  }, [projects]);

  useEffect(() => {
    if (typeof fetch !== 'function') {
      setLoading(false);
      return;
    }

    Promise.all([
      fetch('http://localhost:8000/api/projects').then((response) => {
        if (!response.ok) throw new Error('Projects endpoint unavailable');
        return response.json();
      }),
      fetch('http://localhost:8000/api/agents').then((response) => {
        if (!response.ok) throw new Error('Agents endpoint unavailable');
        return response.json();
      }),
      fetch('http://localhost:8000/api/integrations').then((response) => {
        if (!response.ok) throw new Error('Integration endpoint unavailable');
        return response.json();
      }),
      fetch('http://localhost:8000/api/observability/overview').then((response) => {
        if (!response.ok) throw new Error('Observability endpoint unavailable');
        return response.json();
      }),
      fetch('http://localhost:8000/api/runtime/config').then((response) => {
        if (!response.ok) throw new Error('Runtime config endpoint unavailable');
        return response.json();
      }),
      fetch('http://localhost:8000/api/deployment/status').then((response) => {
        if (!response.ok) throw new Error('Deployment status endpoint unavailable');
        return response.json();
      }),
    ])
      .then(([projectData, agentData, integrationData, observabilityData, runtimeData, deploymentData]) => {
        const backendProjects = Array.isArray(projectData) ? projectData : [];
        setProjects(backendProjects.length ? backendProjects : fallbackProjectsRef.current);
        setAgents(Array.isArray(agentData) ? agentData : []);
        setIntegrations(Array.isArray(integrationData) ? integrationData : []);
        setObservability(observabilityData && Object.keys(observabilityData).length ? observabilityData : null);
        setRuntimeConfig(runtimeData && Object.keys(runtimeData).length ? runtimeData : null);
        setDeploymentStatus(deploymentData && Object.keys(deploymentData).length ? deploymentData : null);
        setError(null);
      })
      .catch(() => {
        setProjects(fallbackProjectsRef.current);
        setError('Orchestrator is offline; no live governance data is available.');
      })
      .finally(() => setLoading(false));
  }, []);

  const pendingApprovals = projects.filter(
    (project) =>
      project.budget !== null &&
      project.budget !== undefined &&
      project.budget >= 20000 &&
      (!project.approval || project.approval.approved !== true),
  );

  const displayAgents = agents;

  const handleApproval = async (projectId: string, approved: boolean) => {
    if (typeof fetch !== 'function') return;

    const project = projects.find((candidate) => candidate.id === projectId);
    const targetStatus = approved ? 'validated' : 'rejected';

    try {
      let effectiveProjectId = projectId;
      const projectLookup = await fetch(`http://localhost:8000/api/projects/${projectId}`);
      if (!projectLookup.ok) {
        if (!project) {
          throw new Error('Project does not exist locally or in the orchestrator.');
        }

        const createResponse = await fetch('http://localhost:8000/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: project.name,
            owner: project.owner,
            budget: project.budget ?? 0,
            description: project.description ?? '',
            timeline: 'not-set',
          }),
        });

        if (!createResponse.ok) {
          throw new Error('Project could not be synced to the orchestrator.');
        }

        const createdProject = await createResponse.json();
        effectiveProjectId = createdProject.id;
        setProjects((current) =>
          current.map((item) => (item.id === projectId ? { ...item, id: createdProject.id, status: createdProject.status ?? item.status } : item)),
        );
      }

      const response = await fetch(`http://localhost:8000/api/projects/${effectiveProjectId}/approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approved,
          approver: 'governance-console',
          note: approved ? 'Approved from UI' : 'Rejected from UI',
        }),
      });

      if (!response.ok) {
        throw new Error('Approval request failed');
      }

      const result = await response.json();
      const nextStatus = result.status ?? project?.status ?? targetStatus;

      setProjects((current) =>
        current.map((item) =>
          item.id === effectiveProjectId
            ? {
                ...item,
                status: nextStatus,
                approval: {
                  approved: result.approved,
                  approver: result.approver,
                  decision: result.decision,
                },
              }
            : item,
        ),
      );
      setError(null);
    } catch {
      setError('Approval decision could not be sent to the orchestrator.');
    }
  };

  const resetNewProjectForm = () => {
    setDraftProject({
      name: '',
      shortCode: '',
      owner: 'platform-team',
      sponsorTitle: '',
      lineOfBusiness: 'Technology & Operations',
      businessOwnerSameAsSponsor: true,
      businessOwner: '',
      businessObjective: '',
      objective: '',
      kpis: [
        { kpi: '', unit: '%', direction: 'Increase', baseline: '', target: '', measureBy: '', dataSource: '' },
        { kpi: '', unit: '%', direction: 'Increase', baseline: '', target: '', measureBy: '', dataSource: '' },
      ],
      successCriteria: '',
      problemStatement: '',
      affectedUsers: '',
      inScope: '',
      outOfScope: '',
      assumptions: '',
      dependencies: [{ name: '', type: 'Team' }],
      scope: '',
      sourceMaterial: '',
      documentLinks: [{ url: '', documentType: 'BRD', owner: 'platform-team' }],
      repository: '',
      repositoryType: 'new',
      repoUrl: '',
      newRepoName: '',
      techStack: '',
      constraints: '',
      dataClassification: 'internal',
      totalAmount: '',
      currency: 'USD',
      fundingPeriod: 'Project lifetime',
      costCenter: '',
      budget: '15000',
      releaseDate: '',
      priority: 'medium',
      approvers: '',
      autonomyLevel: 'medium',
      accessNeeded: '',
      targetReleaseDate: '',
    });
    setCharterStep('project-name-sponsor');
    setCompletedCharterItems([]);
    setReviewOnly(false);
  };

  const saveProjectDraft = async () => {
    const trimmedName = draftProject.name.trim();
    if (!trimmedName) {
      setError('Project name is required.');
      return;
    }

    const payload = {
      name: trimmedName,
      owner: draftProject.owner.trim() || 'platform-team',
      budget: Number(draftProject.budget) || 0,
      description: draftProject.businessObjective.trim() || draftProject.problemStatement.trim(),
      timeline: draftProject.releaseDate || 'not-set',
    };

    let createdProject: Project = {
      id: `project-${Date.now()}`,
      name: trimmedName,
      owner: payload.owner,
      status: 'draft',
      budget: payload.budget,
      description: payload.description,
      approval: null,
    };

    if (typeof fetch === 'function') {
      try {
        const response = await fetch('http://localhost:8000/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          const remoteProject = await response.json();
          createdProject = {
            ...createdProject,
            ...remoteProject,
            budget: remoteProject.budget ?? createdProject.budget,
            approval: remoteProject.approval ?? null,
          };
        }
      } catch {
        setError('Orchestrator is unavailable. The project was saved locally and will need to be re-synced when the backend is reachable.');
      }
    }

    setProjects((current) => [createdProject, ...current]);
    resetNewProjectForm();
    setShowCreateProjectForm(false);
    setError(null);
    setActiveView('overview');
  };

  const togglePermission = (key: PermissionKey) => {
    setPermissions((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const handleAgentDraftChange = <K extends keyof AgentDraft>(key: K, value: AgentDraft[K]) => {
    setAgentDraft((current) => ({
      ...current,
      [key]: value,
    }));
    if (key === 'url') {
      setAgentPreview(null);
    }
  };

  const openAgentOnboarding = () => {
    setAgentDraft(emptyAgentDraft);
    setAgentPreview(null);
    setAgentFormError(null);
    setIsOnboardingAgent(true);
  };

  const fetchAgentCard = async () => {
    const url = agentDraft.url.trim();
    if (!url) {
      setAgentFormError('Enter the agent URL first, e.g. http://ba-agent:8104');
      return;
    }

    try {
      const response = await fetch('http://localhost:8000/api/agents/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Could not read the Agent Card.'));
      }
      setAgentPreview(await response.json());
      setAgentFormError(null);
    } catch (error) {
      setAgentPreview(null);
      setAgentFormError(error instanceof Error ? error.message : 'Could not read the Agent Card.');
    }
  };

  const registerAgent = async () => {
    if (!agentPreview) {
      setAgentFormError('Fetch and check the Agent Card before registering.');
      return;
    }

    try {
      const response = await fetch('http://localhost:8000/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: agentPreview.url,
          autonomy: agentDraft.autonomy,
          instances: Number(agentDraft.instances) || 1,
          tools: agentDraft.tools
            .split(',')
            .map((tool) => tool.trim())
            .filter(Boolean),
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Agent registration failed.'));
      }

      const nextAgent = await response.json();
      setAgents((current) => [...current, nextAgent]);
      setIsOnboardingAgent(false);
      setAgentFormError(null);
    } catch (error) {
      setAgentFormError(error instanceof Error ? error.message : 'Agent registration failed.');
    }
  };

  const isCharterItemComplete = (itemId: CharterChecklistId) => {
    if (completedCharterItems.includes(itemId)) {
      return true;
    }

    switch (itemId) {
      case 'project-name-sponsor':
        return !!draftProject.name.trim();
      case 'objective-kpis':
        return !!(draftProject.objective || draftProject.businessObjective).trim();
      case 'problem-scope':
        return !!draftProject.problemStatement.trim();
      case 'source-material':
        return true;
      case 'repository-stack':
        return !!(draftProject.repositoryType === 'existing' ? draftProject.repoUrl.trim() : (draftProject.newRepoName || draftProject.shortCode || 'default').trim());
      case 'budget-requested':
        return !!(draftProject.totalAmount || draftProject.budget).toString().trim();
      case 'release-priority':
        return !!(draftProject.targetReleaseDate || draftProject.releaseDate).trim();
      default:
        return false;
    }
  };

  const getCurrentStepRequiredError = () => {
    switch (charterStep) {
      case 'project-name-sponsor':
        return !draftProject.name.trim() ? 'Project name is required before continuing.' : null;
      case 'objective-kpis':
        return !(draftProject.objective || draftProject.businessObjective).trim() ? 'Objective is required before continuing.' : null;
      case 'problem-scope':
        return !draftProject.problemStatement.trim() ? 'Problem statement is required before continuing.' : null;
      case 'repository-stack':
        return draftProject.repositoryType === 'existing'
          ? (!draftProject.repoUrl.trim() ? 'Repository URL is required before continuing.' : null)
          : (!draftProject.newRepoName.trim() && !draftProject.shortCode.trim() ? 'Repository name is required before continuing.' : null);
      case 'budget-requested':
        return !(draftProject.totalAmount || draftProject.budget).toString().trim() ? 'Budget amount is required before continuing.' : null;
      case 'release-priority':
        return !(draftProject.targetReleaseDate || draftProject.releaseDate).trim() ? 'Target release date is required before continuing.' : null;
      default:
        return null;
    }
  };

  const renderCharterFields = () => {
    const generatedShortCode = draftProject.shortCode || draftProject.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase();

    switch (charterStep) {
      case 'project-name-sponsor':
        return (
          <>
            <div className="form-grid">
              <label>
                <span className="label-text">Project name<span className="required-star">*</span></span>
                <input
                  aria-label="Project name"
                  value={draftProject.name}
                  onChange={(event) =>
                    setDraftProject((current) => ({
                      ...current,
                      name: event.target.value,
                      shortCode: current.shortCode || event.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase(),
                    }))
                  }
                />
              </label>
              <label>
                <span className="label-text">Short code</span>
                <input
                  value={draftProject.shortCode || generatedShortCode}
                  maxLength={8}
                  onChange={(event) => setDraftProject((current) => ({ ...current, shortCode: event.target.value.toUpperCase() }))}
                />
              </label>
              <label>
                <span className="label-text">Sponsor</span>
                <input
                  value={draftProject.owner}
                  onChange={(event) => setDraftProject((current) => ({ ...current, owner: event.target.value }))}
                />
              </label>
              <label>
                <span className="label-text">Sponsor title</span>
                <input
                  value={draftProject.sponsorTitle}
                  onChange={(event) => setDraftProject((current) => ({ ...current, sponsorTitle: event.target.value }))}
                />
              </label>
              <label>
                <span className="label-text">Line of business</span>
                <select
                  value={draftProject.lineOfBusiness}
                  onChange={(event) => setDraftProject((current) => ({ ...current, lineOfBusiness: event.target.value }))}
                >
                  <option value="Consumer Banking">Consumer Banking</option>
                  <option value="Wealth Management">Wealth Management</option>
                  <option value="Commercial Banking">Commercial Banking</option>
                  <option value="Corporate & Investment Banking">Corporate & Investment Banking</option>
                  <option value="Global Markets">Global Markets</option>
                  <option value="Technology & Operations">Technology & Operations</option>
                  <option value="Risk & Compliance">Risk & Compliance</option>
                </select>
              </label>
              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={draftProject.businessOwnerSameAsSponsor}
                  onChange={(event) => setDraftProject((current) => ({ ...current, businessOwnerSameAsSponsor: event.target.checked }))}
                />
                Business owner same as sponsor
              </label>
              {!draftProject.businessOwnerSameAsSponsor && (
                <label>
                  Business owner
                  <input
                    value={draftProject.businessOwner}
                    onChange={(event) => setDraftProject((current) => ({ ...current, businessOwner: event.target.value }))}
                  />
                </label>
              )}
            </div>
          </>
        );
      case 'objective-kpis':
        return (
          <>
            <label>
              <span className="label-text">Business objective<span className="required-star">*</span></span>
              <textarea
                aria-label="Business objective"
                value={draftProject.objective || draftProject.businessObjective}
                onChange={(event) => setDraftProject((current) => ({ ...current, objective: event.target.value, businessObjective: event.target.value }))}
              />
            </label>

            <div className="field-block">
              <label><span className="label-text">KPI rows</span></label>
              <div className="kpi-table">
                {draftProject.kpis.map((row, index) => (
                  <div key={`kpi-${index}`} className="kpi-row">
                    <select value={row.kpi} onChange={(event) => setDraftProject((current) => ({ ...current, kpis: current.kpis.map((item, rowIndex) => rowIndex === index ? { ...item, kpi: event.target.value } : item) }))}>
                      <option value="">Select KPI</option>
                      <option value="Lead time">Lead time</option>
                      <option value="Cycle time">Cycle time</option>
                      <option value="Deployment frequency">Deployment frequency</option>
                      <option value="Change failure rate">Change failure rate</option>
                      <option value="Mean time to restore">Mean time to restore</option>
                      <option value="Defect escape rate">Defect escape rate</option>
                      <option value="Processing time per case">Processing time per case</option>
                      <option value="Straight-through processing rate">Straight-through processing rate</option>
                      <option value="Manual effort hours saved">Manual effort hours saved</option>
                      <option value="Cost per transaction">Cost per transaction</option>
                      <option value="Fraud loss rate">Fraud loss rate</option>
                      <option value="Claims resolution time">Claims resolution time</option>
                      <option value="First-contact resolution">First-contact resolution</option>
                      <option value="CSAT">CSAT</option>
                      <option value="NPS">NPS</option>
                      <option value="Digital adoption rate">Digital adoption rate</option>
                      <option value="Active users">Active users</option>
                      <option value="Other">Other</option>
                    </select>
                    <select value={row.unit} onChange={(event) => setDraftProject((current) => ({ ...current, kpis: current.kpis.map((item, rowIndex) => rowIndex === index ? { ...item, unit: event.target.value } : item) }))}>
                      <option value="%">%</option>
                      <option value="count">count</option>
                      <option value="hours">hours</option>
                      <option value="days">days</option>
                      <option value="minutes">minutes</option>
                      <option value="$">$</option>
                      <option value="score">score</option>
                    </select>
                    <select value={row.direction} onChange={(event) => setDraftProject((current) => ({ ...current, kpis: current.kpis.map((item, rowIndex) => rowIndex === index ? { ...item, direction: event.target.value } : item) }))}>
                      <option value="Increase">Increase</option>
                      <option value="Decrease">Decrease</option>
                    </select>
                    <input type="number" placeholder="Baseline" value={row.baseline} onChange={(event) => setDraftProject((current) => ({ ...current, kpis: current.kpis.map((item, rowIndex) => rowIndex === index ? { ...item, baseline: event.target.value } : item) }))} />
                    <input type="number" placeholder="Target" value={row.target} onChange={(event) => setDraftProject((current) => ({ ...current, kpis: current.kpis.map((item, rowIndex) => rowIndex === index ? { ...item, target: event.target.value } : item) }))} />
                    <input type="date" placeholder="Measure by" value={row.measureBy} onChange={(event) => setDraftProject((current) => ({ ...current, kpis: current.kpis.map((item, rowIndex) => rowIndex === index ? { ...item, measureBy: event.target.value } : item) }))} />
                    <select value={row.dataSource} onChange={(event) => setDraftProject((current) => ({ ...current, kpis: current.kpis.map((item, rowIndex) => rowIndex === index ? { ...item, dataSource: event.target.value } : item) }))}>
                      <option value="">Data source</option>
                      <option value="Jira">Jira</option>
                      <option value="GitHub">GitHub</option>
                      <option value="Azure Monitor">Azure Monitor</option>
                      <option value="ServiceNow">ServiceNow</option>
                      <option value="Power BI report">Power BI report</option>
                      <option value="Survey">Survey</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <label>
              Success or exit criteria
              <textarea
                value={draftProject.successCriteria}
                onChange={(event) => setDraftProject((current) => ({ ...current, successCriteria: event.target.value }))}
              />
            </label>
          </>
        );
      case 'problem-scope':
        return (
          <>
            <label>
              <span className="label-text">Problem statement<span className="required-star">*</span></span>
              <textarea
                value={draftProject.problemStatement}
                onChange={(event) => setDraftProject((current) => ({ ...current, problemStatement: event.target.value }))}
              />
            </label>

            <label>
              <span className="label-text">Affected users</span>
              <input
                value={draftProject.affectedUsers}
                onChange={(event) => setDraftProject((current) => ({ ...current, affectedUsers: event.target.value }))}
              />
            </label>

            <label>
              In scope
              <textarea
                value={draftProject.inScope || draftProject.scope}
                onChange={(event) => setDraftProject((current) => ({ ...current, inScope: event.target.value, scope: event.target.value }))}
              />
            </label>

            <label>
              Out of scope
              <textarea
                value={draftProject.outOfScope}
                onChange={(event) => setDraftProject((current) => ({ ...current, outOfScope: event.target.value }))}
              />
            </label>

            <label>
              Assumptions
              <textarea
                value={draftProject.assumptions}
                onChange={(event) => setDraftProject((current) => ({ ...current, assumptions: event.target.value }))}
              />
            </label>

            <div className="field-block">
              <label>Dependencies</label>
              {draftProject.dependencies.map((dependency, index) => (
                <div key={`dependency-${index}`} className="kpi-row">
                  <input
                    placeholder="Dependency name"
                    value={dependency.name}
                    onChange={(event) => setDraftProject((current) => ({ ...current, dependencies: current.dependencies.map((item, rowIndex) => rowIndex === index ? { ...item, name: event.target.value } : item) }))}
                  />
                  <select
                    value={dependency.type}
                    onChange={(event) => setDraftProject((current) => ({ ...current, dependencies: current.dependencies.map((item, rowIndex) => rowIndex === index ? { ...item, type: event.target.value } : item) }))}
                  >
                    <option value="Team">Team</option>
                    <option value="System">System</option>
                    <option value="Vendor">Vendor</option>
                    <option value="Data">Data</option>
                  </select>
                </div>
              ))}
            </div>
          </>
        );
      case 'source-material':
        return (
          <>
            <div className="field-block">
              <label><span className="label-text">Document links</span></label>
              {draftProject.documentLinks.map((link, index) => (
                <div key={`doc-${index}`} className="kpi-row">
                  <input
                    placeholder="SharePoint or Confluence URL"
                    value={link.url}
                    onChange={(event) => setDraftProject((current) => ({ ...current, documentLinks: current.documentLinks.map((item, rowIndex) => rowIndex === index ? { ...item, url: event.target.value } : item) }))}
                  />
                  <select
                    value={link.documentType}
                    onChange={(event) => setDraftProject((current) => ({ ...current, documentLinks: current.documentLinks.map((item, rowIndex) => rowIndex === index ? { ...item, documentType: event.target.value } : item) }))}
                  >
                    <option value="BRD">BRD</option>
                    <option value="Policy">Policy</option>
                    <option value="Process doc">Process doc</option>
                    <option value="Architecture">Architecture</option>
                    <option value="Regulatory">Regulatory</option>
                    <option value="Other">Other</option>
                  </select>
                  <input
                    placeholder="Document owner"
                    value={link.owner}
                    onChange={(event) => setDraftProject((current) => ({ ...current, documentLinks: current.documentLinks.map((item, rowIndex) => rowIndex === index ? { ...item, owner: event.target.value } : item) }))}
                  />
                </div>
              ))}
            </div>
          </>
        );
      case 'repository-stack':
        return (
          <>
            <div className="form-grid">
              <label>
                <span className="label-text">Repository<span className="required-star">*</span></span>
                <div className="radio-group">
                  <label><input type="radio" checked={draftProject.repositoryType === 'new'} onChange={() => setDraftProject((current) => ({ ...current, repositoryType: 'new' }))} /> New</label>
                  <label><input type="radio" checked={draftProject.repositoryType === 'existing'} onChange={() => setDraftProject((current) => ({ ...current, repositoryType: 'existing' }))} /> Existing</label>
                </div>
              </label>
              {draftProject.repositoryType === 'existing' && (
                <label>
                  <span className="label-text">Repo URL<span className="required-star">*</span></span>
                  <input
                    value={draftProject.repoUrl}
                    onChange={(event) => setDraftProject((current) => ({ ...current, repoUrl: event.target.value }))}
                  />
                </label>
              )}
              {draftProject.repositoryType === 'new' && (
                <label>
                  <span className="label-text">New repo name<span className="required-star">*</span></span>
                  <input
                    value={draftProject.newRepoName || `${draftProject.shortCode || generatedShortCode}-repo`}
                    onChange={(event) => setDraftProject((current) => ({ ...current, newRepoName: event.target.value }))}
                  />
                </label>
              )}
              <label>
                <span className="label-text">Tech stack</span>
                <input
                  value={draftProject.techStack}
                  onChange={(event) => setDraftProject((current) => ({ ...current, techStack: event.target.value }))}
                />
              </label>
            </div>
          </>
        );
      case 'constraints-data':
        return (
          <>
            <label>
              Constraints
              <textarea
                value={draftProject.constraints}
                onChange={(event) => setDraftProject((current) => ({ ...current, constraints: event.target.value }))}
              />
            </label>

            <label>
              Data classification
              <select
                value={draftProject.dataClassification}
                onChange={(event) => setDraftProject((current) => ({ ...current, dataClassification: event.target.value }))}
              >
                <option value="internal">Internal</option>
                <option value="confidential">Confidential</option>
                <option value="restricted">Restricted</option>
              </select>
            </label>
          </>
        );
      case 'budget-requested':
        return (
          <>
            <div className="form-grid">
              <label>
                <span className="label-text">Total amount<span className="required-star">*</span></span>
                <input
                  type="number"
                  value={draftProject.totalAmount || draftProject.budget}
                  onChange={(event) => setDraftProject((current) => ({ ...current, totalAmount: event.target.value, budget: event.target.value }))}
                />
              </label>
              <label>
                Currency
                <select
                  value={draftProject.currency}
                  onChange={(event) => setDraftProject((current) => ({ ...current, currency: event.target.value }))}
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </label>
              <label>
                Funding period
                <select
                  value={draftProject.fundingPeriod}
                  onChange={(event) => setDraftProject((current) => ({ ...current, fundingPeriod: event.target.value }))}
                >
                  <option value="Per sprint">Per sprint</option>
                  <option value="Monthly">Monthly</option>
                  <option value="Quarterly">Quarterly</option>
                  <option value="Per release">Per release</option>
                  <option value="Project lifetime">Project lifetime</option>
                </select>
              </label>
              <label>
                Cost center
                <input
                  value={draftProject.costCenter}
                  onChange={(event) => setDraftProject((current) => ({ ...current, costCenter: event.target.value }))}
                />
              </label>
            </div>
          </>
        );
      case 'release-priority':
        return (
          <>
            <div className="form-grid">
              <label>
                <span className="label-text">Target release date<span className="required-star">*</span></span>
                <input
                  type="date"
                  value={draftProject.targetReleaseDate || draftProject.releaseDate}
                  onChange={(event) => setDraftProject((current) => ({ ...current, targetReleaseDate: event.target.value, releaseDate: event.target.value }))}
                />
              </label>
              <label>
                Priority
                <select
                  value={draftProject.priority}
                  onChange={(event) => setDraftProject((current) => ({ ...current, priority: event.target.value }))}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
            </div>
          </>
        );
      case 'approvers':
        return (
          <>
            <label>
              Named human approvers
              <input
                value={draftProject.approvers}
                onChange={(event) => setDraftProject((current) => ({ ...current, approvers: event.target.value }))}
              />
            </label>
          </>
        );
      case 'autonomy-level':
        return (
          <>
            <label>
              Requested autonomy level
              <select
                value={draftProject.autonomyLevel}
                onChange={(event) => setDraftProject((current) => ({ ...current, autonomyLevel: event.target.value }))}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
          </>
        );
      case 'access-needed':
        return (
          <>
            <label>
              Access needed
              <input
                value={draftProject.accessNeeded}
                onChange={(event) => setDraftProject((current) => ({ ...current, accessNeeded: event.target.value }))}
              />
            </label>
          </>
        );
      default:
        return null;
    }
  };

  const completedCharterCount = charterChecklist.filter((item) => isCharterItemComplete(item.id)).length;

  const renderReviewSummary = () => (
    <div className="review-summary">
      <h3>Charter summary</h3>

      <div className="summary-grid">
        <div><span>Project name</span><strong>{draftProject.name || 'Not provided'}</strong></div>
        <div><span>Short code</span><strong>{draftProject.shortCode || 'Not provided'}</strong></div>
        <div><span>Sponsor</span><strong>{draftProject.owner || 'Not provided'}</strong></div>
        <div><span>Line of business</span><strong>{draftProject.lineOfBusiness || 'Not provided'}</strong></div>
        <div><span>Business owner</span><strong>{draftProject.businessOwnerSameAsSponsor ? (draftProject.owner || 'Sponsor') : (draftProject.businessOwner || 'Not provided')}</strong></div>
        <div><span>Objective</span><strong>{draftProject.objective || draftProject.businessObjective || 'Not provided'}</strong></div>
        <div><span>Problem statement</span><strong>{draftProject.problemStatement || 'Not provided'}</strong></div>
        <div><span>In scope</span><strong>{draftProject.inScope || draftProject.scope || 'Not provided'}</strong></div>
        <div><span>Out of scope</span><strong>{draftProject.outOfScope || 'Not provided'}</strong></div>
        <div><span>Repository</span><strong>{draftProject.repositoryType === 'existing' ? (draftProject.repoUrl || 'Not provided') : (draftProject.newRepoName || 'Not provided')}</strong></div>
        <div><span>Tech stack</span><strong>{draftProject.techStack || 'Not provided'}</strong></div>
        <div><span>Budget</span><strong>{draftProject.totalAmount || draftProject.budget ? `$${Number(draftProject.totalAmount || draftProject.budget).toLocaleString()}` : 'Not provided'}</strong></div>
        <div><span>Release date</span><strong>{draftProject.targetReleaseDate || draftProject.releaseDate || 'Not provided'}</strong></div>
        <div><span>Priority</span><strong>{draftProject.priority || 'Not provided'}</strong></div>
      </div>
    </div>
  );

  const renderNewProject = () => (
    <section className="new-project-page">
      <div className="page-header-row">
        <button type="button" className="text-button" onClick={() => { setActiveView('overview'); setShowCreateProjectForm(false); resetNewProjectForm(); }}>
          ← Overview
        </button>
        <h1>New project charter</h1>
      </div>
      <p className="page-subtitle">Complete each charter section below. The fields are saved in the browser as you move through the intake flow.</p>

      <div className="wizard-layout">
        <div className="wizard-panel">
          {reviewOnly ? (
            <>
              {renderReviewSummary()}
              <div className="form-footer review-footer">
                <button type="button" className="secondary-button" onClick={() => setReviewOnly(false)}>
                  Back
                </button>
                <button type="button" className="primary-button" onClick={saveProjectDraft}>
                  Submit
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="project-form charter-form">
                <div className="form-section">
                  <h3>{charterChecklist.find((item) => item.id === charterStep)?.label ?? 'Project charter'}</h3>
                  {renderCharterFields()}
                </div>
              </div>

              <div className="form-footer">
                <button type="button" className="secondary-button" onClick={() => {
                  const currentIndex = charterChecklist.findIndex((item) => item.id === charterStep);

                  if (currentIndex === 0) {
                    setActiveView('overview');
                    setShowCreateProjectForm(false);
                    resetNewProjectForm();
                    return;
                  }

                  setCharterStep(charterChecklist[currentIndex - 1].id);
                }}>
                  {charterChecklist.findIndex((item) => item.id === charterStep) === 0 ? 'Cancel' : 'Back'}
                </button>

                <button
                  type="button"
                  className="primary-button"
                  disabled={Boolean(getCurrentStepRequiredError())}
                  onClick={() => {
                    const requiredError = getCurrentStepRequiredError();
                    if (requiredError) {
                      setError(requiredError);
                      return;
                    }

                    setError(null);
                    const currentIndex = charterChecklist.findIndex((item) => item.id === charterStep);
                    const currentItem = charterChecklist[currentIndex];

                    if (currentItem) {
                      setCompletedCharterItems((current) => (current.includes(currentItem.id) ? current : [...current, currentItem.id]));
                    }

                    const nextItem = charterChecklist[currentIndex + 1];
                    if (nextItem) {
                      setCharterStep(nextItem.id);
                    } else {
                      setReviewOnly(true);
                    }
                  }}
                >
                  {charterChecklist.findIndex((item) => item.id === charterStep) === charterChecklist.length - 1 ? 'Review' : 'Continue'}
                </button>
              </div>
            </>
          )}
        </div>

        <aside className="checklist-panel">
          <div className="checklist-header">
            <h2>Charter completeness</h2>
            <div className="progress-meta">
              <span>Required fields</span>
              <strong>{completedCharterCount} of {charterChecklist.length}</strong>
            </div>
          </div>
          <div className="progress-bar"><span style={{ width: `${(completedCharterCount / charterChecklist.length) * 100}%` }} /></div>
          <ul className="checklist">
            {charterChecklist.map((item) => {
              const isComplete = isCharterItemComplete(item.id);
              const isActive = item.id === charterStep;

              return (
                <li
                  key={item.id}
                  className={`${isComplete ? 'done' : 'missing'} ${isActive ? 'active' : ''}`}
                >
                  <button type="button" className="checklist-item-button" onClick={() => setCharterStep(item.id)}>
                    <span className="checkmark">{isComplete ? '✓' : '!'}</span>
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </section>
  );

  const renderOverview = () => (
    <section className="overview-page">
      <div className="page-header-row overview-header">
        <div>
          <p className="eyebrow">Delivery control plane</p>
          <h1>SDLC Governance Console</h1>
          <h2 className="program-title">Program overview</h2>
        </div>
      </div>

      <div className="overview-filters">
        <button type="button" className="filter-chip active">Program Sponsor</button>
        <button type="button" className="filter-chip">Business Owner</button>
        <button type="button" className="filter-chip">Gate approval</button>
        <button type="button" className="filter-chip">AgentOps</button>
      </div>

      <section className="metrics-grid">
        <article className="metric-card highlight-card">
          <span>Lead time, story to done</span>
          <strong>-34%</strong>
          <small>Target: -50% vs baseline</small>
        </article>
        <article className="metric-card">
          <span>Agent task workflow</span>
          <strong>86%</strong>
          <small>Target: 80% - On track</small>
        </article>
        <article className="metric-card">
          <span>Definition of Ready, first pass</span>
          <strong>88%</strong>
          <small>Target: 90% - Watch</small>
        </article>
        <article className="metric-card">
          <span>Speed vs approved</span>
          <strong>+2.8%</strong>
          <small>Target: +5% - On track</small>
        </article>
      </section>

      <section className="panel dashboard-panel">
        <div className="panel-header">
          <h2>Projects dashboard</h2>
          <div className="table-filters">
            <button type="button" className="table-filter active">All</button>
            <button type="button" className="table-filter">Draft</button>
            <button type="button" className="table-filter">Validated</button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="projects-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Status</th>
                <th>Budget</th>
                <th>Deployment readiness</th>
                <th>Next step</th>
              </tr>
            </thead>
            <tbody>
              {projects.length ? (
                projects.map((project) => (
                  <tr key={project.id}>
                    <td>
                      <div className="project-cell">
                        <strong>{project.name}</strong>
                        <small>{project.owner}</small>
                      </div>
                    </td>
                    <td><span className={`status-badge ${project.status}`}>{project.status}</span></td>
                    <td>{project.budget ? `$${project.budget.toLocaleString()}` : 'No budget'}</td>
                    <td>
                      <div className="readiness-cell">
                        <span className={`readiness-pill ${project.status === 'validated' ? 'ready' : project.status === 'rejected' ? 'blocked' : 'watch'}`}>
                          {project.status === 'validated' ? 'Ready' : project.status === 'rejected' ? 'Blocked' : 'Not provisioned'}
                        </span>
                      </div>
                    </td>
                    <td className="next-step-cell">{project.status === 'draft' ? 'Finish charter: 2 required fields missing' : project.status === 'validated' ? 'GO decision waiting for Program Sponsor' : 'Review approval decision'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="empty-table-cell">No projects yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );

  const renderApprovals = () => (
    <section className="approval-page">
      <div className="page-header-row">
        <button type="button" className="text-button" onClick={() => setActiveView('overview')}>
          ← Overview
        </button>
        <h1>Approval actions</h1>
      </div>

      <div className="approval-list-card">
        {pendingApprovals.length ? (
          pendingApprovals.map((project) => (
            <div key={project.id} className="approval-row">
              <div>
                <strong>{project.name}</strong>
                <small>{project.owner}</small>
              </div>
              <div className="approval-meta">
                <span>{project.budget ? `$${project.budget.toLocaleString()}` : 'Pending budget'}</span>
                <span>{project.status}</span>
              </div>
              <div className="approval-actions">
                <button type="button" className="approve-button" onClick={() => handleApproval(project.id, true)}>Approve</button>
                <button type="button" className="reject-button" onClick={() => handleApproval(project.id, false)}>Reject</button>
              </div>
            </div>
          ))
        ) : (
          <p className="empty-state">No approvals pending.</p>
        )}
      </div>
    </section>
  );

  const renderAgentRegistry = () => (
    <section className="agent-registry-page">
      <div className="page-header-row">
        <button type="button" className="text-button" onClick={() => setActiveView('overview')}>
          ← Overview
        </button>
        <h1>Agent registry</h1>
      </div>

      <div className="panel dashboard-panel">
        <div className="panel-header">
          <h2>Agent registry</h2>
          <button type="button" className="primary-button" onClick={openAgentOnboarding}>
            Onboard agent
          </button>
        </div>
        <p className="registry-hint">
          Agents are built and deployed from the repo, then registered here by URL. The orchestrator reads each agent&apos;s
          Agent Card and routes work to it by skill.
        </p>
        <div className="table-wrap">
          <table className="projects-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>A2A skills</th>
                <th>Status</th>
                <th>Autonomy</th>
                <th>Instances</th>
                <th>Tool integrations</th>
              </tr>
            </thead>
            <tbody>
              {displayAgents.length ? (
                displayAgents.map((agent) => (
                  <tr key={agent.id ?? agent.name}>
                    <td>
                      <div className="project-cell">
                        <strong>{agent.name}</strong>
                        <small>
                          {agent.system ? 'System · registry host' : agent.role}
                          {agent.version ? ` · v${agent.version}` : ''}
                        </small>
                      </div>
                    </td>
                    <td>
                      <div className="skill-chips">
                        {(agent.skills ?? []).map((skill) => (
                          <code key={skill} className="skill-chip">{skill}</code>
                        ))}
                      </div>
                    </td>
                    <td><span className={`status-badge ${agent.status}`}>{agent.status}</span></td>
                    <td>{agent.autonomy}</td>
                    <td>{agent.max_instances && agent.max_instances > 1 ? `${agent.instances ?? 1} of ${agent.max_instances}` : '1'}</td>
                    <td>
                      <button
                        type="button"
                        className="tool-icon-button"
                        aria-label={`Open tool integrations for ${agent.name}`}
                        onClick={() => {
                          setSelectedAgent(agent);
                          setPermissions(defaultPermissions);
                          setToolAccessOpen(true);
                        }}
                      >
                        🔧
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="empty-table-cell">No agents registered yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );

  return (
    <div className="governance-app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-kicker">Delivery control plane</span>
          <strong>SDLC Governance</strong>
        </div>

        <div className="sidebar-actions">
          <button
            type="button"
            className="new-project-button"
            onClick={() => {
              setActiveView('new-project');
              setShowCreateProjectForm(true);
              resetNewProjectForm();
            }}
          >
            + New project
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          <button
            type="button"
            className={`nav-item ${activeView === 'overview' ? 'active' : ''}`}
            onClick={() => {
              setActiveView('overview');
              setShowCreateProjectForm(false);
            }}
          >
            <span className="nav-icon">◌</span>
            <span>Overview</span>
          </button>

          <button
            type="button"
            className={`nav-item ${activeView === 'agent-registry' ? 'active' : ''}`}
            onClick={() => {
              setActiveView('agent-registry');
              setShowCreateProjectForm(false);
            }}
          >
            <span className="nav-icon">◈</span>
            <span>Agent registry</span>
          </button>
        </nav>
      </aside>

      <main className="content-shell">
        <header className="topbar">
          <div className="search-box">
            <span className="search-icon">⌕</span>
            <input type="text" placeholder="Search stories, agents, trace IDs, approvals..." aria-label="Search" />
          </div>

          <div className="topbar-actions">
            <span className="status-pill live-pill">{loading ? 'Refreshing' : 'Live • synced 12 s ago'}</span>
            <button
              type="button"
              aria-label="Approval mailbox"
              className="mailbox-button"
              onClick={() => setActiveView('approvals')}
            >
              <span className="mailbox-icon">✉</span>
              <span className="mailbox-badge">{pendingApprovals.length}</span>
            </button>
            <button type="button" className="secondary-button">Pause agents</button>
          </div>
        </header>

        {error ? <div className="banner">{error}</div> : null}

        {activeView === 'new-project' || showCreateProjectForm ? renderNewProject() : null}
        {activeView === 'approvals' ? renderApprovals() : null}
        {activeView === 'agent-registry' ? renderAgentRegistry() : null}
        {activeView === 'overview' && !showCreateProjectForm ? renderOverview() : null}

        {isOnboardingAgent ? (
          <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Register an agent">
            <div className="tool-modal">
              <div className="modal-header">
                <h3>Register agent</h3>
                <button type="button" className="close-button" onClick={() => setIsOnboardingAgent(false)}>×</button>
              </div>

              <div className="modal-body">
                <div className="project-form">
                  <div className="form-grid">
                    <label htmlFor="agent-url">
                      <span className="label-text">Agent URL</span>
                      <input
                        id="agent-url"
                        placeholder="http://ba-agent:8104"
                        value={agentDraft.url}
                        onChange={(event) => handleAgentDraftChange('url', event.target.value)}
                      />
                    </label>
                    <div className="agent-fetch-row">
                      <button type="button" className="secondary-button" onClick={fetchAgentCard}>Fetch card</button>
                    </div>
                  </div>

                  {agentPreview ? (
                    <div className="agent-card-preview" aria-label="Agent Card preview">
                      <strong>{agentPreview.name}</strong> <small>v{agentPreview.version}</small>
                      <span className={`status-badge ${agentPreview.healthy ? 'online' : 'offline'}`}>
                        {agentPreview.healthy ? 'online' : 'offline'}
                      </span>
                      <p>{agentPreview.description}</p>
                      <div className="skill-chips">
                        {agentPreview.skills.map((skill) => (
                          <code key={skill.id} className="skill-chip" title={skill.description}>{skill.id}</code>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="form-grid">
                    <label htmlFor="agent-autonomy">
                      <span className="label-text">Autonomy level</span>
                      <select id="agent-autonomy" value={agentDraft.autonomy} onChange={(event) => handleAgentDraftChange('autonomy', event.target.value)}>
                        <option value="L0">L0 · Suggest only</option>
                        <option value="L1">L1 · Approve each action</option>
                        <option value="L2">L2 · Sampled review</option>
                        <option value="L3">L3 · Autonomous within guardrails</option>
                      </select>
                    </label>
                    <label htmlFor="agent-instances">
                      <span className="label-text">Instances</span>
                      <input
                        id="agent-instances"
                        type="number"
                        min={1}
                        max={agentPreview?.max_instances ?? 1}
                        disabled={!agentPreview || agentPreview.max_instances <= 1}
                        value={agentDraft.instances}
                        onChange={(event) => handleAgentDraftChange('instances', event.target.value)}
                      />
                    </label>
                    <label htmlFor="agent-tools">
                      <span className="label-text">Allowed tools (comma separated)</span>
                      <input id="agent-tools" value={agentDraft.tools} onChange={(event) => handleAgentDraftChange('tools', event.target.value)} />
                    </label>
                  </div>

                  {agentFormError ? <div className="banner" role="alert">{agentFormError}</div> : null}
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="secondary-button" onClick={() => setIsOnboardingAgent(false)}>Cancel</button>
                <button type="button" className="primary-button" onClick={registerAgent} disabled={!agentPreview}>Register agent</button>
              </div>
            </div>
          </div>
        ) : null}

        {toolAccessOpen && selectedAgent ? (
          <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Tool integrations configuration">
            <div className="tool-modal">
              <div className="modal-header">
                <h3>{selectedAgent.name}</h3>
                <button type="button" className="close-button" onClick={() => setToolAccessOpen(false)}>×</button>
              </div>

              <div className="modal-body">
                <p>Configure permissions and platform access for this agent.</p>
                <div className="permission-list">
                  {[
                    ['repo', 'Repository access'],
                    ['secrets', 'Secrets manager'],
                    ['observability', 'Observability'],
                    ['deployments', 'Deployment operations'],
                    ['data', 'Data access'],
                  ].map(([key, label]) => (
                    <label key={key} className="permission-item">
                      <input
                        type="checkbox"
                        checked={permissions[key as PermissionKey]}
                        onChange={() => togglePermission(key as PermissionKey)}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="secondary-button" onClick={() => setToolAccessOpen(false)}>Cancel</button>
                <button type="button" className="primary-button" onClick={() => setToolAccessOpen(false)}>Save access</button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
