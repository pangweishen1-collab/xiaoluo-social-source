import { DAILY_EDITION_SECTIONS, isOriginalHttpsUrl } from "../shared/daily-edition.mjs";

export const DAILY_SECTION_KEYS = DAILY_EDITION_SECTIONS.map((section) => section.key);
export const DAILY_SECTION_LABELS = Object.fromEntries(DAILY_EDITION_SECTIONS.map((section) => [section.key, section.label]));

const string = (value) => typeof value === "string" ? value.trim() : "";

const safeSourceUrls = (value) => Array.isArray(value) ? [...new Set(value.filter(isOriginalHttpsUrl))] : [];

// The lead and highlights are placements, not copies of a report item. An event
// appears once in the reading order even if an import repeats it in a section.
export function prepareDailyEdition(edition) {
  if (!edition || edition.schemaVersion !== 1 || !Array.isArray(edition.sections)) return null;
  const seen = new Set();
  const sections = DAILY_SECTION_KEYS.map((key) => {
    const input = edition.sections.find((section) => section?.key === key);
    const items = Array.isArray(input?.items) ? input.items.flatMap((item) => {
      const id = string(item?.id);
      const title = string(item?.title);
      const eventKey = string(item?.eventKey) || id;
      if (!id || !title || seen.has(id) || seen.has(`event:${eventKey}`)) return [];
      seen.add(id); seen.add(`event:${eventKey}`);
      return [{
        id, eventKey, title,
        summary: string(item?.summary),
        eventDate: /^\d{4}-\d{2}-\d{2}$/.test(string(item?.eventDate)) ? item.eventDate : "",
        sourceUrls: safeSourceUrls(item?.sourceUrls),
        sectionKey: key,
        sectionLabel: DAILY_SECTION_LABELS[key],
      }];
    }) : [];
    return { key, label: DAILY_SECTION_LABELS[key], items };
  });
  const allItems = sections.flatMap((section) => section.items);
  if (!allItems.length) return null;
  const byId = new Map(allItems.map((item) => [item.id, item]));
  const lead = byId.get(string(edition.leadItemId)) || allItems[0];
  const highlights = [...new Set(Array.isArray(edition.highlightIds) ? edition.highlightIds : [])]
    .map((id) => byId.get(string(id)))
    .filter((item) => item && item.id !== lead.id)
    .slice(0, 3);
  const promoted = new Set([lead.id, ...highlights.map((item) => item.id)]);
  return {
    lead,
    highlights,
    sections: sections.map((section) => ({ ...section, originalCount: section.items.length, items: section.items.filter((item) => !promoted.has(item.id)) })),
    total: allItems.length,
  };
}
