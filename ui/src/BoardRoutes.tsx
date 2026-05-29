import { lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "@/lib/router";
import { loadLastInboxTab } from "./lib/inbox-tabs";

const Layout = lazy(() => import("./components/Layout").then(({ Layout }) => ({ default: Layout })));
const OnboardingRoutePage = lazy(() =>
  import("./pages/OnboardingRoutePage").then(({ OnboardingRoutePage }) => ({ default: OnboardingRoutePage })),
);
const Companies = lazy(() => import("./pages/Companies").then(({ Companies }) => ({ default: Companies })));
const Agents = lazy(() => import("./pages/Agents").then(({ Agents }) => ({ default: Agents })));
const AgentDetail = lazy(() => import("./pages/AgentDetail").then(({ AgentDetail }) => ({ default: AgentDetail })));
const Clients = lazy(() => import("./pages/Clients").then(({ Clients }) => ({ default: Clients })));
const ClientDetail = lazy(() => import("./pages/ClientDetail").then(({ ClientDetail }) => ({ default: ClientDetail })));
const Projects = lazy(() => import("./pages/Projects").then(({ Projects }) => ({ default: Projects })));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail").then(({ ProjectDetail }) => ({ default: ProjectDetail })));
const ProjectWorkspaceDetail = lazy(() =>
  import("./pages/ProjectWorkspaceDetail").then(({ ProjectWorkspaceDetail }) => ({ default: ProjectWorkspaceDetail })),
);
const Workspaces = lazy(() => import("./pages/Workspaces").then(({ Workspaces }) => ({ default: Workspaces })));
const Issues = lazy(() => import("./pages/Issues").then(({ Issues }) => ({ default: Issues })));
const Search = lazy(() => import("./pages/Search").then(({ Search }) => ({ default: Search })));
const IssueDetail = lazy(() => import("./pages/IssueDetail").then(({ IssueDetail }) => ({ default: IssueDetail })));
const IssueChatLongThreadPerf = lazy(() =>
  import("./pages/IssueChatLongThreadPerf").then(({ IssueChatLongThreadPerf }) => ({ default: IssueChatLongThreadPerf })),
);
const Calendar = lazy(() => import("./pages/Calendar").then(({ Calendar }) => ({ default: Calendar })));
const Routines = lazy(() => import("./pages/Routines").then(({ Routines }) => ({ default: Routines })));
const RoutineDetail = lazy(() => import("./pages/RoutineDetail").then(({ RoutineDetail }) => ({ default: RoutineDetail })));
const UserProfile = lazy(() => import("./pages/UserProfile").then(({ UserProfile }) => ({ default: UserProfile })));
const ExecutionWorkspaceDetail = lazy(() =>
  import("./pages/ExecutionWorkspaceDetail").then(({ ExecutionWorkspaceDetail }) => ({ default: ExecutionWorkspaceDetail })),
);
const Goals = lazy(() => import("./pages/Goals").then(({ Goals }) => ({ default: Goals })));
const GoalDetail = lazy(() => import("./pages/GoalDetail").then(({ GoalDetail }) => ({ default: GoalDetail })));
const Approvals = lazy(() => import("./pages/Approvals").then(({ Approvals }) => ({ default: Approvals })));
const ApprovalDetail = lazy(() => import("./pages/ApprovalDetail").then(({ ApprovalDetail }) => ({ default: ApprovalDetail })));
const Costs = lazy(() => import("./pages/Costs").then(({ Costs }) => ({ default: Costs })));
const Payments = lazy(() => import("./pages/Payments").then(({ Payments }) => ({ default: Payments })));
const Usage = lazy(() => import("./pages/Usage").then(({ Usage }) => ({ default: Usage })));
const Activity = lazy(() => import("./pages/Activity").then(({ Activity }) => ({ default: Activity })));
const Inbox = lazy(() => import("./pages/Inbox").then(({ Inbox }) => ({ default: Inbox })));
const CompanySettings = lazy(() => import("./pages/CompanySettings").then(({ CompanySettings }) => ({ default: CompanySettings })));
const CompanyEmailSettings = lazy(() =>
  import("./pages/CompanyEmailSettings").then(({ CompanyEmailSettings }) => ({ default: CompanyEmailSettings })),
);
const InboundEmailOps = lazy(() => import("./pages/InboundEmailOps").then(({ InboundEmailOps }) => ({ default: InboundEmailOps })));
const CompanyInstructions = lazy(() =>
  import("./pages/CompanyInstructions").then(({ CompanyInstructions }) => ({ default: CompanyInstructions })),
);
const CompanyEnvironments = lazy(() =>
  import("./pages/CompanyEnvironments").then(({ CompanyEnvironments }) => ({ default: CompanyEnvironments })),
);
const CompanySettingsPluginPage = lazy(() =>
  import("./pages/CompanySettingsPluginPage").then(({ CompanySettingsPluginPage }) => ({ default: CompanySettingsPluginPage })),
);
const CompanyAccess = lazy(() => import("./pages/CompanyAccess").then(({ CompanyAccess }) => ({ default: CompanyAccess })));
const CompanyAccessLegacyRoute = lazy(() =>
  import("./pages/CompanyAccess").then(({ CompanyAccessLegacyRoute }) => ({ default: CompanyAccessLegacyRoute })),
);
const CloudUpstream = lazy(() => import("./pages/CloudUpstream").then(({ CloudUpstream }) => ({ default: CloudUpstream })));
const CompanyInvites = lazy(() => import("./pages/CompanyInvites").then(({ CompanyInvites }) => ({ default: CompanyInvites })));
const CompanySkills = lazy(() => import("./pages/CompanySkills").then(({ CompanySkills }) => ({ default: CompanySkills })));
const Secrets = lazy(() => import("./pages/Secrets").then(({ Secrets }) => ({ default: Secrets })));
const CompanyExport = lazy(() => import("./pages/CompanyExport").then(({ CompanyExport }) => ({ default: CompanyExport })));
const CompanyImport = lazy(() => import("./pages/CompanyImport").then(({ CompanyImport }) => ({ default: CompanyImport })));
const DesignGuide = lazy(() => import("./pages/DesignGuide").then(({ DesignGuide }) => ({ default: DesignGuide })));
const AdapterManager = lazy(() => import("./pages/AdapterManager").then(({ AdapterManager }) => ({ default: AdapterManager })));
const PluginPage = lazy(() => import("./pages/PluginPage").then(({ PluginPage }) => ({ default: PluginPage })));
const OrgChart = lazy(() => import("./pages/OrgChart").then(({ OrgChart }) => ({ default: OrgChart })));
const NewAgent = lazy(() => import("./pages/NewAgent").then(({ NewAgent }) => ({ default: NewAgent })));
const JoinRequestQueue = lazy(() =>
  import("./pages/JoinRequestQueue").then(({ JoinRequestQueue }) => ({ default: JoinRequestQueue })),
);
const NotFoundPage = lazy(() => import("./pages/NotFound").then(({ NotFoundPage }) => ({ default: NotFoundPage })));

function InboxRootRedirect() {
  return <Navigate to={`/inbox/${loadLastInboxTab()}`} replace />;
}

function LegacySettingsRedirect() {
  const location = useLocation();
  return <Navigate to={`/instance/settings/general${location.search}${location.hash}`} replace />;
}

export function BoardRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="onboarding" element={<OnboardingRoutePage />} />
        <Route path="companies" element={<Companies />} />
        <Route path="company/settings" element={<CompanySettings />} />
        <Route path="company/settings/email" element={<CompanyEmailSettings />} />
        <Route path="company/settings/email/ops" element={<Navigate to="/email/ops" replace />} />
        <Route path="company/instructions" element={<CompanyInstructions />} />
        <Route path="company/settings/environments" element={<CompanyEnvironments />} />
        <Route path="company/settings/members" element={<CompanyAccess />} />
        <Route path="company/settings/access" element={<CompanyAccessLegacyRoute />} />
        <Route path="company/settings/cloud-upstream" element={<CloudUpstream />} />
        <Route path="company/settings/invites" element={<CompanyInvites />} />
        <Route path="company/export/*" element={<CompanyExport />} />
        <Route path="company/import" element={<CompanyImport />} />
        <Route path="company/settings/secrets" element={<Secrets />} />
        <Route path="company/settings/:settingsRoutePath/*" element={<CompanySettingsPluginPage />} />
        <Route path="skills/*" element={<CompanySkills />} />
        <Route path="settings" element={<LegacySettingsRedirect />} />
        <Route path="settings/*" element={<LegacySettingsRedirect />} />
        <Route path="plugins/:pluginId" element={<PluginPage />} />
        <Route path="org" element={<OrgChart />} />
        <Route path="agents" element={<Navigate to="/agents/all" replace />} />
        <Route path="agents/all" element={<Agents />} />
        <Route path="agents/active" element={<Agents />} />
        <Route path="agents/paused" element={<Agents />} />
        <Route path="agents/error" element={<Agents />} />
        <Route path="agents/new" element={<NewAgent />} />
        <Route path="agents/:agentId" element={<AgentDetail />} />
        <Route path="agents/:agentId/:tab" element={<AgentDetail />} />
        <Route path="agents/:agentId/runs/:runId" element={<AgentDetail />} />
        <Route path="clients" element={<Clients />} />
        <Route path="clients/:clientId" element={<ClientDetail />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:projectId" element={<ProjectDetail />} />
        <Route path="projects/:projectId/overview" element={<ProjectDetail />} />
        <Route path="projects/:projectId/files" element={<ProjectDetail />} />
        <Route path="projects/:projectId/issues" element={<ProjectDetail />} />
        <Route path="projects/:projectId/issues/:filter" element={<ProjectDetail />} />
        <Route path="projects/:projectId/workspaces/:workspaceId" element={<ProjectWorkspaceDetail />} />
        <Route path="projects/:projectId/workspaces" element={<ProjectDetail />} />
        <Route path="projects/:projectId/configuration" element={<ProjectDetail />} />
        <Route path="projects/:projectId/budget" element={<ProjectDetail />} />
        <Route path="workspaces" element={<Workspaces />} />
        <Route path="issues" element={<Issues />} />
        <Route path="search" element={<Search />} />
        <Route path="issues/all" element={<Navigate to="/issues" replace />} />
        <Route path="issues/active" element={<Navigate to="/issues" replace />} />
        <Route path="issues/backlog" element={<Navigate to="/issues" replace />} />
        <Route path="issues/done" element={<Navigate to="/issues" replace />} />
        <Route path="issues/recent" element={<Navigate to="/issues" replace />} />
        <Route path="issues/:issueId" element={<IssueDetail />} />
        {import.meta.env.DEV ? (
          <Route path="tests/perf/long-thread" element={<IssueChatLongThreadPerf />} />
        ) : null}
        <Route path="calendar" element={<Calendar />} />
        <Route path="routines" element={<Routines />} />
        <Route path="routines/:routineId" element={<RoutineDetail />} />
        <Route path="execution-workspaces/:workspaceId" element={<ExecutionWorkspaceDetail />} />
        <Route path="execution-workspaces/:workspaceId/services" element={<ExecutionWorkspaceDetail />} />
        <Route path="execution-workspaces/:workspaceId/configuration" element={<ExecutionWorkspaceDetail />} />
        <Route path="execution-workspaces/:workspaceId/runtime-logs" element={<ExecutionWorkspaceDetail />} />
        <Route path="execution-workspaces/:workspaceId/issues" element={<ExecutionWorkspaceDetail />} />
        <Route path="execution-workspaces/:workspaceId/routines" element={<ExecutionWorkspaceDetail />} />
        <Route path="goals" element={<Goals />} />
        <Route path="goals/:goalId" element={<GoalDetail />} />
        <Route path="approvals" element={<Navigate to="/approvals/pending" replace />} />
        <Route path="approvals/pending" element={<Approvals />} />
        <Route path="approvals/all" element={<Approvals />} />
        <Route path="approvals/:approvalId" element={<ApprovalDetail />} />
        <Route path="costs" element={<Costs />} />
        <Route path="payments" element={<Payments />} />
        <Route path="usage" element={<Usage />} />
        <Route path="activity" element={<Activity />} />
        <Route path="email/ops" element={<InboundEmailOps />} />
        <Route path="inbox" element={<InboxRootRedirect />} />
        <Route path="inbox/mine" element={<Inbox />} />
        <Route path="inbox/recent" element={<Inbox />} />
        <Route path="inbox/unread" element={<Inbox />} />
        <Route path="inbox/blocked" element={<Inbox />} />
        <Route path="inbox/all" element={<Inbox />} />
        <Route path="inbox/requests" element={<JoinRequestQueue />} />
        <Route path="inbox/new" element={<Navigate to="/inbox/mine" replace />} />
        <Route path="u/:userSlug" element={<UserProfile />} />
        <Route path="design-guide" element={<DesignGuide />} />
        <Route path="instance/settings/adapters" element={<AdapterManager />} />
        <Route path=":pluginRoutePath/*" element={<PluginPage />} />
        <Route path="*" element={<NotFoundPage scope="board" />} />
      </Route>
    </Routes>
  );
}
