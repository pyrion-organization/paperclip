import type { DashboardIssueActivityDay, DashboardRunActivityDay } from "@paperclipai/shared";
import { ChartCard, IssueStatusChart, PriorityChart, RunActivityChart, SuccessRateChart } from "./ActivityCharts";

export function DashboardCharts({
  issueActivity,
  runActivity,
}: {
  issueActivity: DashboardIssueActivityDay[];
  runActivity: DashboardRunActivityDay[];
}) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <ChartCard title="Run Activity" subtitle="Last 14 days">
        <RunActivityChart activity={runActivity} />
      </ChartCard>
      <ChartCard title="Issues by Priority" subtitle="Last 14 days">
        <PriorityChart activity={issueActivity} />
      </ChartCard>
      <ChartCard title="Issues by Status" subtitle="Last 14 days">
        <IssueStatusChart activity={issueActivity} />
      </ChartCard>
      <ChartCard title="Success Rate" subtitle="Last 14 days">
        <SuccessRateChart activity={runActivity} />
      </ChartCard>
    </div>
  );
}
