/**
 * Structured website edition of a daily report. The Markdown and WeChat
 * deliverables remain independent: this file never rewrites either one.
 */
export const DAILY_EDITION_SECTIONS = Object.freeze([
  Object.freeze({ key: 'radar', label: '产品雷达' }),
  Object.freeze({ key: 'hiring', label: '团队与招聘动向' }),
  Object.freeze({ key: 'week_changes', label: '语聊直播产品近一周变化' }),
]);

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validDate = value => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function isOriginalHttpsUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && Boolean(parsed.hostname) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

/** Validate untrusted input, including referential integrity of the lead and highlights. */
export function validateDailyEdition(value) {
  const errors = [];
  if (!isRecord(value)) return { ok: false, errors: ['edition must be an object'] };
  if (value.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!Array.isArray(value.sections) || value.sections.length !== DAILY_EDITION_SECTIONS.length) {
    errors.push('sections must contain the three fixed daily-report sections');
  }

  const itemIds = new Set();
  const eventKeys = new Set();
  if (Array.isArray(value.sections)) {
    value.sections.forEach((section, sectionIndex) => {
      const path = `sections[${sectionIndex}]`;
      const expected = DAILY_EDITION_SECTIONS[sectionIndex];
      if (!isRecord(section) || !expected || section.key !== expected.key || section.label !== expected.label) {
        errors.push(`${path} must be ${expected?.key ?? 'absent'} with its fixed label`);
        return;
      }
      if (!Array.isArray(section.items) || section.items.length > 60) {
        errors.push(`${path}.items must be an array of at most 60 entries`);
        return;
      }
      section.items.forEach((item, itemIndex) => {
        const itemPath = `${path}.items[${itemIndex}]`;
        if (!isRecord(item)) {
          errors.push(`${itemPath} must be an object`);
          return;
        }
        for (const field of ['id', 'eventKey', 'title', 'summary']) {
          const limit = field === 'summary' ? 4000 : field === 'title' ? 240 : 300;
          if (typeof item[field] !== 'string' || !item[field].trim() || item[field].length > limit) {
            errors.push(`${itemPath}.${field} must be a nonempty string of at most ${limit} characters`);
          }
        }
        if (typeof item.id === 'string' && item.id.trim()) {
          if (itemIds.has(item.id)) errors.push(`${itemPath}.id is duplicated`);
          itemIds.add(item.id);
        }
        if (typeof item.eventKey === 'string' && item.eventKey.trim()) {
          if (eventKeys.has(item.eventKey)) errors.push(`${itemPath}.eventKey is duplicated`);
          eventKeys.add(item.eventKey);
        }
        if (item.eventDate !== null && !validDate(item.eventDate)) {
          errors.push(`${itemPath}.eventDate must be a real YYYY-MM-DD date or null`);
        }
        if (!Array.isArray(item.sourceUrls) || !item.sourceUrls.length || item.sourceUrls.length > 12
          || item.sourceUrls.some(url => !isOriginalHttpsUrl(url))
          || new Set(item.sourceUrls).size !== item.sourceUrls.length) {
          errors.push(`${itemPath}.sourceUrls must contain unique original HTTPS links`);
        }
      });
    });
  }

  if (value.leadItemId !== null && (typeof value.leadItemId !== 'string' || !itemIds.has(value.leadItemId))) {
    errors.push('leadItemId must reference a real item or be null');
  }
  if (value.leadItemId === null && itemIds.size > 0) {
    errors.push('leadItemId is required when there are verified items');
  }
  if (!Array.isArray(value.highlightIds) || value.highlightIds.length > 3
    || value.highlightIds.some(id => typeof id !== 'string' || !itemIds.has(id) || id === value.leadItemId)
    || new Set(value.highlightIds).size !== value.highlightIds.length) {
    errors.push('highlightIds must reference up to three distinct non-lead items');
  }
  return { ok: errors.length === 0, errors };
}

/** Stored legacy rows have no edition; corrupt edition JSON must not break them. */
export function parseDailyEdition(value) {
  if (value === null || value === undefined || value === '') return null;
  let candidate = value;
  if (typeof value === 'string') {
    try { candidate = JSON.parse(value); } catch { return null; }
  }
  return validateDailyEdition(candidate).ok ? candidate : null;
}

/**
 * Convert the Skill's internal fact-record into website-only edition data.
 * Missing evidence is omitted, never filled with invented text or links.
 */
export function createDailyEditionFromFactRecord(record, options = {}) {
  if (!isRecord(record) || !Array.isArray(record.items)) {
    throw new TypeError('Fact record must contain an items array');
  }
  const sections = DAILY_EDITION_SECTIONS.map(section => ({ ...section, items: [] }));
  const bySection = new Map(sections.map(section => [section.key, section]));
  const seenEvents = new Set();
  const acceptedItems = [];
  for (const fact of record.items) {
    if (!isRecord(fact) || fact.verification_status !== 'verified') continue;
    if (fact.previously_reported === true
      && (typeof fact.substantive_new_detail !== 'string' || !fact.substantive_new_detail.trim())) continue;
    const section = bySection.get(fact.section);
    const eventKey = typeof fact.event_key === 'string' ? fact.event_key.trim() : '';
    const title = typeof fact.reported_title === 'string' ? fact.reported_title.trim() : '';
    const facts = Array.isArray(fact.verified_facts)
      ? fact.verified_facts.filter(text => typeof text === 'string').map(text => text.trim()).filter(Boolean)
      : [];
    const sourceUrls = Array.isArray(fact.source_urls)
      ? [...new Set(fact.source_urls.filter(url => typeof url === 'string').map(url => url.trim()).filter(isOriginalHttpsUrl))]
      : [];
    if (!section || !eventKey || !title || !facts.length || !sourceUrls.length || seenEvents.has(eventKey)) continue;
    if (fact.event_date !== null && fact.event_date !== undefined && !validDate(fact.event_date)) {
      throw new TypeError(`Invalid event_date for ${eventKey}`);
    }
    const item = {
      id: eventKey,
      eventKey,
      title,
      summary: facts.join('；'),
      eventDate: fact.event_date ?? null,
      sourceUrls,
    };
    section.items.push(item);
    acceptedItems.push(item);
    seenEvents.add(eventKey);
  }
  const selectedLead = options.leadEventKey ?? record.lead_event_key;
  if (selectedLead !== undefined && selectedLead !== null && !seenEvents.has(selectedLead)) {
    throw new TypeError('Selected lead must be a verified item with an original HTTPS source');
  }
  const leadItemId = selectedLead ?? acceptedItems[0]?.id ?? null;
  const selectedHighlights = options.highlightEventKeys ?? record.highlight_event_keys ?? [];
  if (!Array.isArray(selectedHighlights) || selectedHighlights.some(id => !seenEvents.has(id))) {
    throw new TypeError('Selected highlights must be verified items with original HTTPS sources');
  }
  const highlightIds = [...new Set(selectedHighlights)].filter(id => id !== leadItemId).slice(0, 3);
  const edition = { schemaVersion: 1, leadItemId, highlightIds, sections };
  const result = validateDailyEdition(edition);
  if (!result.ok) throw new TypeError(`Invalid edition from fact record: ${result.errors.join('; ')}`);
  return edition;
}
