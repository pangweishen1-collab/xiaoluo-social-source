"use client";

import { useEffect, useState } from "react";
import DailyEditor from "./daily-editor";
import DailyIssueReader from "./daily-issue-reader";
import { invalidatePublicData } from "./public-data-cache.mjs";

export default function DailyReports({ admin = false }: { admin?: boolean }) {
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState("");
  const [readerVersion, setReaderVersion] = useState(0);

  // Keep historic links from search and shared messages working after the
  // archive became an in-page reader.
  useEffect(() => {
    const openLinkedReport = () => {
      const date = window.location.hash.match(/^#daily-(\d{4}-\d{2}-\d{2})$/)?.[1];
      if (date) window.location.replace(`/daily/${date}`);
    };
    openLinkedReport();
    window.addEventListener("hashchange", openLinkedReport);
    return () => window.removeEventListener("hashchange", openLinkedReport);
  }, []);

  return <div className="daily-reports daily-reports-embedded">
    {admin && <div className="daily-admin-actions shell"><button type="button" onClick={() => { setNotice(""); setPublishing(true); }}>发布日报 ＋</button><span role="status">{notice}</span></div>}
    <DailyIssueReader key={readerVersion} embedded />
    {admin && publishing && <DailyEditor onClose={() => setPublishing(false)} onSaved={() => {
      invalidatePublicData("/api/daily-reports");
      invalidatePublicData("/api/daily-reports?index=1");
      setPublishing(false);
      setReaderVersion((version) => version + 1);
      setNotice("日报已发布。");
    }} />}
  </div>;
}
