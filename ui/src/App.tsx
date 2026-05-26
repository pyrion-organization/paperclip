import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import { useCompany } from "./context/CompanyContext";
import { useDialog, useDialogActions } from "./context/DialogContext";
import { loadLastInboxTab } from "./lib/inbox-tabs";
import { shouldRedirectCompanylessRouteToOnboarding } from "./lib/onboarding-route";

const CloudAccessGate = lazy(() =>
  import("./components/CloudAccessGate").then(({ CloudAccessGate }) => ({ default: CloudAccessGate })),
);
const Layout = lazy(() => import("./components/Layout").then(({ Layout }) => ({ default: Layout })));
const OnboardingWizard = lazy(() =>
  import("./components/OnboardingWizard").then(({ OnboardingWizard }) => ({ default: OnboardingWizard })),
);
const Dashboard = lazy(() => import("./pages/Dashboard").then(({ Dashboard }) => ({ default: Dashboard })));
const DashboardLive = lazy(() => import("./pages/DashboardLive").then(({ DashboardLive }) => ({ default: DashboardLive })));
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
const CloudUpstreamUxLab = lazy(() =>
  import("./pages/CloudUpstreamUxLab").then(({ CloudUpstreamUxLab }) => ({ default: CloudUpstreamUxLab })),
);
const CompanyInvites = lazy(() => import("./pages/CompanyInvites").then(({ CompanyInvites }) => ({ default: CompanyInvites })));
const CompanySkills = lazy(() => import("./pages/CompanySkills").then(({ CompanySkills }) => ({ default: CompanySkills })));
const Secrets = lazy(() => import("./pages/Secrets").then(({ Secrets }) => ({ default: Secrets })));
const CompanyExport = lazy(() => import("./pages/CompanyExport").then(({ CompanyExport }) => ({ default: CompanyExport })));
const CompanyImport = lazy(() => import("./pages/CompanyImport").then(({ CompanyImport }) => ({ default: CompanyImport })));
const DesignGuide = lazy(() => import("./pages/DesignGuide").then(({ DesignGuide }) => ({ default: DesignGuide })));
const InstanceGeneralSettings = lazy(() =>
  import("./pages/InstanceGeneralSettings").then(({ InstanceGeneralSettings }) => ({ default: InstanceGeneralSettings })),
);
const InstanceAccess = lazy(() => import("./pages/InstanceAccess").then(({ InstanceAccess }) => ({ default: InstanceAccess })));
const InstanceSettings = lazy(() => import("./pages/InstanceSettings").then(({ InstanceSettings }) => ({ default: InstanceSettings })));
const InstanceExperimentalSettings = lazy(() =>
  import("./pages/InstanceExperimentalSettings").then(({ InstanceExperimentalSettings }) => ({ default: InstanceExperimentalSettings })),
);
const ProfileSettings = lazy(() => import("./pages/ProfileSettings").then(({ ProfileSettings }) => ({ default: ProfileSettings })));
const PluginManager = lazy(() => import("./pages/PluginManager").then(({ PluginManager }) => ({ default: PluginManager })));
const PluginSettings = lazy(() => import("./pages/PluginSettings").then(({ PluginSettings }) => ({ default: PluginSettings })));
const AdapterManager = lazy(() => import("./pages/AdapterManager").then(({ AdapterManager }) => ({ default: AdapterManager })));
const PluginPage = lazy(() => import("./pages/PluginPage").then(({ PluginPage }) => ({ default: PluginPage })));
const OrgChart = lazy(() => import("./pages/OrgChart").then(({ OrgChart }) => ({ default: OrgChart })));
const NewAgent = lazy(() => import("./pages/NewAgent").then(({ NewAgent }) => ({ default: NewAgent })));
const AuthPage = lazy(() => import("./pages/Auth").then(({ AuthPage }) => ({ default: AuthPage })));
const BoardClaimPage = lazy(() => import("./pages/BoardClaim").then(({ BoardClaimPage }) => ({ default: BoardClaimPage })));
const CliAuthPage = lazy(() => import("./pages/CliAuth").then(({ CliAuthPage }) => ({ default: CliAuthPage })));
const InviteLandingPage = lazy(() =>
  import("./pages/InviteLanding").then(({ InviteLandingPage }) => ({ default: InviteLandingPage })),
);
const JoinRequestQueue = lazy(() =>
  import("./pages/JoinRequestQueue").then(({ JoinRequestQueue }) => ({ default: JoinRequestQueue })),
);
const NotFoundPage = lazy(() => import("./pages/NotFound").then(({ NotFoundPage }) => ({ default: NotFoundPage })));

function RouteFallback() {
  return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">Loading...</div>;
}

function boardRoutes() {
  return (
    <>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="dashboard/live" element={<DashboardLive />} />
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
    </>
  );
}

function InboxRootRedirect() {
  return <Navigate to={`/inbox/${loadLastInboxTab()}`} replace />;
}

function LegacySettingsRedirect() {
  const location = useLocation();
  return <Navigate to={`/instance/settings/general${location.search}${location.hash}`} replace />;
}

function OnboardingRoutePage() {
  const { companies } = useCompany();
  const { openOnboarding } = useDialogActions();
  const { companyPrefix } = useParams<{ companyPrefix?: string }>();
  const matchedCompany = companyPrefix
    ? companies.find((company) => company.issuePrefix.toUpperCase() === companyPrefix.toUpperCase()) ?? null
    : null;

  const title = matchedCompany
    ? `Add another agent to ${matchedCompany.name}`
    : companies.length > 0
      ? "Create another company"
      : "Create your first company";
  const description = matchedCompany
    ? "Run onboarding again to add an agent and a starter task for this company."
    : companies.length > 0
      ? "Run onboarding again to create another company and seed its first agent."
      : "Get started by creating a company and your first agent.";

  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <div className="mt-4">
          <Button
            onClick={() =>
              matchedCompany
                ? openOnboarding({ initialStep: 2, companyId: matchedCompany.id })
                : openOnboarding()
            }
          >
            {matchedCompany ? "Add Agent" : "Start Onboarding"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CompanyRootRedirect() {
  const { companies, selectedCompany, loading } = useCompany();
  const location = useLocation();

  if (loading) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">Loading...</div>;
  }

  const targetCompany = selectedCompany ?? companies[0] ?? null;
  if (!targetCompany) {
    if (
      shouldRedirectCompanylessRouteToOnboarding({
        pathname: location.pathname,
        hasCompanies: false,
      })
    ) {
      return <Navigate to="/onboarding" replace />;
    }
    return <NoCompaniesStartPage />;
  }

  return <Navigate to={`/${targetCompany.issuePrefix}/dashboard`} replace />;
}

function UnprefixedBoardRedirect() {
  const location = useLocation();
  const { companies, selectedCompany, loading } = useCompany();

  if (loading) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">Loading...</div>;
  }

  const targetCompany = selectedCompany ?? companies[0] ?? null;
  if (!targetCompany) {
    if (
      shouldRedirectCompanylessRouteToOnboarding({
        pathname: location.pathname,
        hasCompanies: false,
      })
    ) {
      return <Navigate to="/onboarding" replace />;
    }
    return <NoCompaniesStartPage />;
  }

  return (
    <Navigate
      to={`/${targetCompany.issuePrefix}${location.pathname}${location.search}${location.hash}`}
      replace
    />
  );
}

function NoCompaniesStartPage() {
  const { openOnboarding } = useDialogActions();
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">
          {t("app.noCompanies.title", { defaultValue: "Create your first company" })}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("app.noCompanies.description", { defaultValue: "Get started by creating a company." })}
        </p>
        <div className="mt-4">
          <Button onClick={() => openOnboarding()}>
            {t("app.noCompanies.newCompany", { defaultValue: "New Company" })}
          </Button>
        </div>
      </div>
    </div>
  );
}

function OnboardingWizardMount() {
  const { onboardingOpen } = useDialog();
  const location = useLocation();
  const routeCanOpenOnboarding = /(^|\/)onboarding$/.test(location.pathname);

  if (!onboardingOpen && !routeCanOpenOnboarding) return null;

  return (
    <Suspense fallback={null}>
      <OnboardingWizard />
    </Suspense>
  );
}

export function App() {
  return (
    <>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="auth" element={<AuthPage />} />
          <Route path="board-claim/:token" element={<BoardClaimPage />} />
          <Route path="cli-auth/:id" element={<CliAuthPage />} />
          <Route path="invite/:token" element={<InviteLandingPage />} />
          <Route path="tests/perf/long-thread" element={<IssueChatLongThreadPerf />} />
          <Route path="ux-lab/cloud-upstream" element={<CloudUpstreamUxLab />} />

          <Route element={<CloudAccessGate />}>
            <Route index element={<CompanyRootRedirect />} />
            <Route path="onboarding" element={<OnboardingRoutePage />} />
            <Route path="instance" element={<Navigate to="/instance/settings/general" replace />} />
            <Route path="instance/settings" element={<Layout />}>
              <Route index element={<Navigate to="general" replace />} />
              <Route path="profile" element={<ProfileSettings />} />
              <Route path="general" element={<InstanceGeneralSettings />} />
              <Route path="access" element={<InstanceAccess />} />
              <Route path="heartbeats" element={<InstanceSettings />} />
              <Route path="experimental" element={<InstanceExperimentalSettings />} />
              <Route path="plugins" element={<PluginManager />} />
              <Route path="plugins/:pluginId" element={<PluginSettings />} />
              <Route path="adapters" element={<AdapterManager />} />
            </Route>
            <Route path="companies" element={<UnprefixedBoardRedirect />} />
            <Route path="issues" element={<UnprefixedBoardRedirect />} />
            <Route path="issues/:issueId" element={<UnprefixedBoardRedirect />} />
            <Route path="calendar" element={<UnprefixedBoardRedirect />} />
            <Route path="routines" element={<UnprefixedBoardRedirect />} />
            <Route path="routines/:routineId" element={<UnprefixedBoardRedirect />} />
            <Route path="u/:userSlug" element={<UnprefixedBoardRedirect />} />
            <Route path="skills/*" element={<UnprefixedBoardRedirect />} />
            <Route path="settings" element={<LegacySettingsRedirect />} />
            <Route path="settings/*" element={<LegacySettingsRedirect />} />
            <Route path="email/ops" element={<UnprefixedBoardRedirect />} />
            <Route path="agents" element={<UnprefixedBoardRedirect />} />
            <Route path="agents/new" element={<UnprefixedBoardRedirect />} />
            <Route path="agents/:agentId" element={<UnprefixedBoardRedirect />} />
            <Route path="agents/:agentId/:tab" element={<UnprefixedBoardRedirect />} />
            <Route path="agents/:agentId/runs/:runId" element={<UnprefixedBoardRedirect />} />
            <Route path="clients" element={<UnprefixedBoardRedirect />} />
            <Route path="clients/:clientId" element={<UnprefixedBoardRedirect />} />
            <Route path="projects" element={<UnprefixedBoardRedirect />} />
            <Route path="projects/:projectId" element={<UnprefixedBoardRedirect />} />
            <Route path="projects/:projectId/overview" element={<UnprefixedBoardRedirect />} />
            <Route path="projects/:projectId/files" element={<UnprefixedBoardRedirect />} />
            <Route path="projects/:projectId/issues" element={<UnprefixedBoardRedirect />} />
            <Route path="projects/:projectId/issues/:filter" element={<UnprefixedBoardRedirect />} />
            <Route path="projects/:projectId/workspaces" element={<UnprefixedBoardRedirect />} />
            <Route path="projects/:projectId/workspaces/:workspaceId" element={<UnprefixedBoardRedirect />} />
            <Route path="projects/:projectId/configuration" element={<UnprefixedBoardRedirect />} />
            <Route path="workspaces" element={<UnprefixedBoardRedirect />} />
            <Route path="execution-workspaces/:workspaceId" element={<UnprefixedBoardRedirect />} />
            <Route path="execution-workspaces/:workspaceId/services" element={<UnprefixedBoardRedirect />} />
            <Route path="execution-workspaces/:workspaceId/configuration" element={<UnprefixedBoardRedirect />} />
            <Route path="execution-workspaces/:workspaceId/runtime-logs" element={<UnprefixedBoardRedirect />} />
            <Route path="execution-workspaces/:workspaceId/issues" element={<UnprefixedBoardRedirect />} />
            <Route path="execution-workspaces/:workspaceId/routines" element={<UnprefixedBoardRedirect />} />
            <Route path=":companyPrefix" element={<Layout />}>
              {boardRoutes()}
            </Route>
            <Route path="*" element={<NotFoundPage scope="global" />} />
          </Route>
        </Routes>
      </Suspense>
      <OnboardingWizardMount />
    </>
  );
}
