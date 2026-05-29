import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "@/lib/router";
import { CloudAccessGate } from "./components/CloudAccessGate";
import { useCompany } from "./context/CompanyContext";
import { useDialog } from "./context/DialogContext";
import { isBoardPathWithoutPrefix } from "./lib/company-routes";
import { shouldRedirectCompanylessRouteToOnboarding } from "./lib/onboarding-route";

const Layout = lazy(() => import("./components/Layout").then(({ Layout }) => ({ default: Layout })));
const BoardDashboardRoutes = lazy(() =>
  import("./BoardDashboardRoutes").then(({ BoardDashboardRoutes }) => ({ default: BoardDashboardRoutes })),
);
const BoardRoutes = lazy(() => import("./BoardRoutes").then(({ BoardRoutes }) => ({ default: BoardRoutes })));
const OnboardingWizard = lazy(() =>
  import("./components/OnboardingWizard").then(({ OnboardingWizard }) => ({ default: OnboardingWizard })),
);
const OnboardingRoutePage = lazy(() =>
  import("./pages/OnboardingRoutePage").then(({ OnboardingRoutePage }) => ({ default: OnboardingRoutePage })),
);
const NoCompaniesStartPage = lazy(() =>
  import("./pages/NoCompaniesStartPage").then(({ NoCompaniesStartPage }) => ({ default: NoCompaniesStartPage })),
);
const IssueChatLongThreadPerf = lazy(() =>
  import("./pages/IssueChatLongThreadPerf").then(({ IssueChatLongThreadPerf }) => ({ default: IssueChatLongThreadPerf })),
);
const CloudUpstreamUxLab = lazy(() =>
  import("./pages/CloudUpstreamUxLab").then(({ CloudUpstreamUxLab }) => ({ default: CloudUpstreamUxLab })),
);
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
const AuthPage = lazy(() => import("./pages/Auth").then(({ AuthPage }) => ({ default: AuthPage })));
const BoardClaimPage = lazy(() => import("./pages/BoardClaim").then(({ BoardClaimPage }) => ({ default: BoardClaimPage })));
const CliAuthPage = lazy(() => import("./pages/CliAuth").then(({ CliAuthPage }) => ({ default: CliAuthPage })));
const InviteLandingPage = lazy(() =>
  import("./pages/InviteLanding").then(({ InviteLandingPage }) => ({ default: InviteLandingPage })),
);
const NotFoundPage = lazy(() => import("./pages/NotFound").then(({ NotFoundPage }) => ({ default: NotFoundPage })));

function RouteFallback() {
  return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">Loading&hellip;</div>;
}

function LegacySettingsRedirect() {
  const location = useLocation();
  return <Navigate to={`/instance/settings/general${location.search}${location.hash}`} replace />;
}

function CompanyRootRedirect() {
  const { companies, selectedCompany, loading } = useCompany();
  const location = useLocation();

  if (loading) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">Loading&hellip;</div>;
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
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">Loading&hellip;</div>;
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

function BoardRoutesGate() {
  const location = useLocation();

  if (isBoardPathWithoutPrefix(location.pathname)) {
    return <UnprefixedBoardRedirect />;
  }

  return <BoardRoutes />;
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
            <Route path="payments" element={<UnprefixedBoardRedirect />} />
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
            <Route path="dashboard/*" element={<UnprefixedBoardRedirect />} />
            <Route path=":companyPrefix/dashboard/*" element={<BoardDashboardRoutes />} />
            <Route path=":companyPrefix/*" element={<BoardRoutesGate />} />
            <Route path="*" element={<NotFoundPage scope="global" />} />
          </Route>
        </Routes>
      </Suspense>
      <OnboardingWizardMount />
    </>
  );
}
