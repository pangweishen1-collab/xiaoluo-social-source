export function generateStaticParams() { return []; }

import type { Metadata } from "next";
import DailyIssueReader from "../../daily-issue-reader";
import "../../daily-reports.css";
import "../../daily-issue.css";

export const metadata: Metadata = {
  title: "小骆日报｜出海社交行业观察",
  description: "小骆日报：按期阅读海外语聊、直播与社交产品动态。",
};

export default function DailyIssuePage() { return <DailyIssueReader />; }
