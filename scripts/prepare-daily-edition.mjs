import { readFile } from 'node:fs/promises';
import { createDailyEditionFromFactRecord } from '../shared/daily-edition.mjs';

const input = process.argv[2];
if (!input || input.startsWith('--')) {
  throw new Error('Usage: node scripts/prepare-daily-edition.mjs fact-record.json [--lead-event-key KEY] [--highlight-event-key KEY]');
}
let leadEventKey;
const highlightEventKeys = [];
for (let index = 3; index < process.argv.length; index += 2) {
  const flag = process.argv[index];
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
  if (flag === '--lead-event-key') leadEventKey = value;
  else if (flag === '--highlight-event-key') highlightEventKeys.push(value);
  else throw new Error(`Unknown option: ${flag}`);
}
const record = JSON.parse(await readFile(input, 'utf8'));
const edition = createDailyEditionFromFactRecord(record, {
  ...(leadEventKey ? { leadEventKey } : {}),
  ...(highlightEventKeys.length ? { highlightEventKeys } : {}),
});
process.stdout.write(`${JSON.stringify(edition, null, 2)}\n`);
