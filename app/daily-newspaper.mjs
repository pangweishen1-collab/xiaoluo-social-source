// Presentation only: keep original wording, dates, links and ordering intact.
// Historical Markdown has no ranked lead; never invent one while typesetting it.
// Promote only an explicitly labelled lead, never the first arbitrary bold line.
export function splitDailyHeadlineIntro(intro) {
  const lines = String(intro ?? "").split("\n");
  let fenceMarker = "";
  for (let index = 0; index < lines.length; index++) {
    const fence = lines[index].match(/^\s*(`{3,}|~{3,})/);
    if (fence) { fenceMarker = fenceMarker ? fenceMarker === fence[1][0] ? "" : fenceMarker : fence[1][0]; continue; }
    if (fenceMarker) continue;
    const marker = lines[index].trim().match(/^头条(?:\s*[｜|丨：:]\s*(.+))?$/u);
    if (!marker) continue;
    let titleIndex = index + 1;
    while (titleIndex < lines.length && !lines[titleIndex].trim()) titleIndex++;
    const title = lines[titleIndex]?.trim().match(/^\*\*([^*]+)\*\*\s*$/u);
    if (!title) continue;
    return { before: lines.slice(0, index).join("\n").trim(), lead: { label: marker[1]?.trim() || "", title: title[1], body: lines.slice(titleIndex + 1).join("\n").trim() } };
  }
  return { before: String(intro ?? ""), lead: null };
}

export function prepareDailyNewspaper(body) {
  const lines = restorePlainStandardHeadings(String(body ?? "").replace(/\r\n?/g, "\n")).split("\n");
  const headings = [];
  let scanFence = "";
  for (const line of lines) {
    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) { scanFence = scanFence ? scanFence === fence[1][0] ? "" : scanFence : fence[1][0]; continue; }
    if (!scanFence && /^##\s+\d{1,2}\s+\S/u.test(line)) headings.push(line);
  }
  const standard = headings.length > 0;
  let documentTitle = "";
  let lead = null;
  let footer = "";
  const intro = [];
  const sections = [];
  let current = null;
  let fenced = false;
  let fenceMarker = "";
  for (const line of lines) {
    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      if (!fenced) { fenced = true; fenceMarker = fence[1][0]; }
      else if (fence[1][0] === fenceMarker) fenced = false;
    }
    if (standard && !fenced && !fence) {
      const title = line.match(/^#\s+(.+)$/);
      if (title && !current && !lead && !documentTitle) { documentTitle = title[1].trim(); continue; }
      const explicitLead = line.match(/^##\s+头条\s*[：:｜|]\s*(.+)$/u);
      if (explicitLead && !current) { lead = { label: "", title: explicitLead[1].trim(), lines: [] }; current = lead; continue; }
      if (/^\*\*小骆语聊[：:]\*\*\s+/u.test(line)) { footer = line; continue; }
    }
    const heading = !fenced && !fence ? line.match(/^(?:#{1,2}\s+(.+)|(?:###\s+)?([一二三四五六七八九十]+、.+))\s*$/) : null;
    if (heading) {
      const title = (heading[1] || heading[2]).trim().replace(/\s+#+\s*$/, "");
      current = { key: `daily-paper-section-${sections.length + 1}`, title, lines: [] };
      sections.push(current);
    } else (current ? current.lines : intro).push(line);
  }
  const prepared = sections.map(({ key, title, lines }, sectionIndex) => {
    const preamble = [];
    const stories = [];
    let story = null;
    let inFence = false;
    let marker = "";
    lines.forEach((line, index) => {
      const fence = line.match(/^\s*(`{3,}|~{3,})/);
      if (fence) {
        if (!inFence) { inFence = true; marker = fence[1][0]; }
        else if (fence[1][0] === marker) inFence = false;
      }
      const headline = !inFence && !fence && (standard || index === 0 || !lines[index - 1].trim()) ? line.match(standard ? /^###\s+(.+?)\s*#*\s*$/u : /^\*\*([^*]+)\*\*\s*$/u) : null;
      if (headline) {
        story = { title: headline[1], lines: [] };
        stories.push(story);
      } else (story ? story.lines : preamble).push(line);
    });
    return {
      key, title, number: standard ? title.match(/^(\d{1,2})\s+/u)?.[1].padStart(2, "0") || String(sectionIndex + 1).padStart(2, "0") : String(sectionIndex + 1).padStart(2, "0"),
      label: title.replace(/^(?:[一二三四五六七八九十]+、\s*|\d{1,2}\s+)/u, ""),
      intro: (standard ? trimDivider(preamble.join("\n")) : preamble.join("\n").trim()),
      stories: stories.map(({ title, lines }) => ({ title, body: standard ? trimDivider(lines.join("\n")) : lines.join("\n").trim() })),
    };
  });
  const sourceUrls = new Set();
  for (const match of String(body ?? "").matchAll(/\]\((https?:\/\/[^\s)]+)\)|^(https?:\/\/\S+)\s*$/gm)) {
    try { sourceUrls.add(new URL(match[1] || match[2]).href); } catch { /* No inferred link counts. */ }
  }
  return { intro: intro.join("\n").trim(), sections: prepared, total: prepared.reduce((sum, section) => sum + section.stories.length, 0), sourceCount: sourceUrls.size,
    ...(standard ? { layout: "standard", documentTitle, footer, lead: lead ? { label: lead.label, title: lead.title, body: trimDivider(lead.lines.join("\n")) } : null } : {}),
  };
}

// Some existing reports were pasted as plain text. Restore only the explicit
// five-column standard report outline for display; never rewrite stored content.
function restorePlainStandardHeadings(text) {
  const lines = text.split("\n");
  const titles = ["01 产品雷达", "02 排名异动", "03 团队与招聘动向", "04 语聊直播产品近一周变化", "05 今日观察"];
  if (!/^\d{1,2}月\d{1,2}日海外语聊直播行业日报$/u.test(lines[0]?.trim() || "") || lines.some(line => /^#{1,3}\s|^\s*(`{3,}|~{3,})/u.test(line))) return text;
  const positions = titles.map(title => lines.indexOf(title));
  if (!/^头条[：:]\s*\S/u.test(lines[1] || "") || positions.some((position, i) => position < 2 || (i > 0 && position <= positions[i - 1]))) return text;
  let section = -1;
  return lines.map((line, index) => {
    if (index === 0) return `# ${line}`;
    if (index === 1) return `## ${line}`;
    const category = titles.indexOf(line);
    if (category >= 0) { section = category; return `## ${line}`; }
    if ([0, 2, 3].includes(section) && /^[^｜|\n]{1,60}[｜|][^。！？\n]{1,140}$/u.test(line)) return `### ${line}`;
    if (/^小骆语聊[：:]\s+https?:\/\/\S+$/u.test(line)) return line.replace(/^小骆语聊([：:])/u, "**小骆语聊$1**");
    if (/^(排名上升|排名下滑)$/u.test(line)) return `\n**${line}**\n`;
    return line;
  }).join("\n");
}

function trimDivider(text) {
  return text.trim().replace(/(?:\n|^)[ \t]*---[ \t]*$/u, "").trim();
}
