import { lazy } from "react";
import { Route, Routes } from "@/lib/router";

const Layout = lazy(() => import("./components/Layout").then(({ Layout }) => ({ default: Layout })));
const Dashboard = lazy(() => import("./pages/Dashboard").then(({ Dashboard }) => ({ default: Dashboard })));
const DashboardLive = lazy(() => import("./pages/DashboardLive").then(({ DashboardLive }) => ({ default: DashboardLive })));

export function BoardDashboardRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="live" element={<DashboardLive />} />
      </Route>
    </Routes>
  );
}
