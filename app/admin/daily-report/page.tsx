import { DailyReportView } from "@/components/features/reports/daily-report-view";

export const metadata = { title: "Daily report" };

export default async function DailyReportPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  return <DailyReportView initialDate={date} />;
}
