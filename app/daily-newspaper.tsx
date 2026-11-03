import { formatDailyMarkdown, renderMarkdown } from "./daily-markdown";
import { splitDailyHeadlineIntro } from "./daily-newspaper.mjs";

export type Newspaper = {
  intro: string;
  sections: { key: string; title: string; label: string; number: string; intro: string; stories: { title: string; body: string }[] }[];
  total: number;
  sourceCount: number;
  layout?: "standard";
  documentTitle?: string;
  footer?: string;
  lead?: { label: string; title: string; body: string } | null;
};

function renderPaperBody(body: string, standard: boolean) {
  return renderMarkdown(formatDailyMarkdown(body), standard ? { paragraphClassName: text => {
    const plain = text.replace(/\*\*/g, "").trim();
    // Only explicit standalone metadata is secondary; never mute a mixed paragraph.
    if (!plain.includes("\n") && /^(榜单口径|对比日期|产品类型|更新日期|发布日期)[：:]/u.test(plain)) return "daily-paper-meta";
    if (/^排名(?:上升|下滑)$/u.test(plain)) return "daily-paper-group-label";
    if (/^怎么看[：:]/u.test(plain)) return "daily-paper-reading-note";
    return undefined;
  } } : undefined);
}

export default function DailyNewspaper({ paper, showDocumentTitle = true }: { paper: Newspaper; showDocumentTitle?: boolean }) {
  // Retire only this repeated overview note; preserve other context and dates.
  const intro = paper.intro.split("\n").filter(line => line.trim() !== "矩阵产品变化覆盖近一周；历史在招机会单独标明日期。").join("\n").trim();
  const split = splitDailyHeadlineIntro(intro);
  const before = paper.lead ? intro : split.before;
  const lead = paper.lead || split.lead;
  const pairedRadar = paper.layout === "standard" && paper.sections[0]?.label === "产品雷达" && paper.sections[1]?.label === "排名异动";
  return <section className={`daily-paper daily-issue-legacy${paper.layout === "standard" ? " daily-paper-standard" : ""}`} aria-label="日报正文">
    {showDocumentTitle && paper.documentTitle && <p className="daily-paper-document-title">{paper.documentTitle}</p>}
    {before && <div className="daily-paper-intro daily-report-body">{renderMarkdown(formatDailyMarkdown(before))}</div>}
    {lead && <section className="daily-paper-lead" aria-labelledby="daily-paper-lead-title">
      <div className="daily-lead-kicker"><span>头条</span>{lead.label && <p>{lead.label}</p>}<small aria-hidden="true">TOP STORY</small></div>
      <h2 id="daily-paper-lead-title">{lead.title}</h2>
      {lead.body && <div className="daily-paper-lead-summary daily-report-body">{renderMarkdown(formatDailyMarkdown(lead.body))}</div>}
    </section>}
    <div className={`daily-paper-sections${pairedRadar ? " daily-paper-sections-paired" : ""}`}>
      {paper.sections.map(section => <section className="daily-paper-section" id={section.key} key={section.key} aria-labelledby={`${section.key}-title`}>
        <header className="daily-paper-section-heading"><span aria-hidden="true">{section.number}</span><h2 id={`${section.key}-title`}>{section.label}</h2>{section.stories.length > 0 && <small>{section.stories.length} 条</small>}</header>
        {section.intro && <div className="daily-paper-section-intro daily-report-body">{renderPaperBody(section.intro, paper.layout === "standard")}</div>}
        <div className="daily-paper-stories">
          {section.stories.map((story, index) => <article className="daily-paper-story" key={`${section.key}-${index}`}>
            <h3>{story.title}</h3>
            <div className="daily-report-body">{renderPaperBody(story.body, paper.layout === "standard")}</div>
          </article>)}
        </div>
      </section>)}
    </div>
    {paper.footer && <div className="daily-paper-footer daily-report-body">{renderMarkdown(formatDailyMarkdown(paper.footer.replace(/(\*\*小骆语聊[：:]\*\*)\s+(https?:\/\/\S+)/u, "$1 [$2]($2)")))}</div>}
  </section>;
}
