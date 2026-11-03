/**
 * Run only in the independent verifier environment. This signs an already
 * reviewed verdict; it does not decide whether a source supports a claim.
 */
import { createPrivateKey, sign } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createDailyEditionFromFactRecord, validateDailyEdition } from '../shared/daily-edition.mjs';
import {
  canonicalJson, checkSourceUrls, isValidDate, sha256,
  validateEditionBody, validateFactRecord, validateReportPair,
} from './daily-publication-gate.mjs';

const [payloadPath, factsPath, reviewPath, flag, outputPath] = process.argv.slice(2);
if (!payloadPath || !factsPath || !reviewPath || flag !== '--out' || !outputPath) {
  throw new Error('Usage: sign-daily-verification.mjs report.json facts.json independent-review.json --out verification.json');
}
const privateKeyPem = process.env.XIAOLU_DAILY_VERIFIER_PRIVATE_KEY;
if (!privateKeyPem) throw new Error('Verifier private key is not configured in the isolated verifier environment');
const [rawPayload, rawFacts, rawReview] = await Promise.all([payloadPath, factsPath, reviewPath].map(path => readFile(path, 'utf8')));
const data = JSON.parse(rawPayload);
const record = JSON.parse(rawFacts);
const review = JSON.parse(rawReview);
if (!isValidDate(data.date) || !validateDailyEdition(data.edition).ok) throw new Error('Report date/edition is invalid');
const errors = [
  ...validateFactRecord(record, data.edition, data.date),
  ...validateEditionBody(data.edition, data.body),
  ...validateReportPair(data),
];
const expected = createDailyEditionFromFactRecord(record).sections.flatMap(section => section.items.map(item => item.eventKey)).sort();
if (review.verdict !== 'pass' || !Array.isArray(review.verifiedEventKeys)
  || canonicalJson([...review.verifiedEventKeys].sort()) !== canonicalJson(expected)
  || !review.verifierId || !/^[a-zA-Z0-9._:-]{3,100}$/.test(review.verifierId)) {
  errors.push('Independent review verdict, verifier identity, or event coverage is incomplete');
}
const required = ['source_access', 'claim_support', 'app_identity', 'date_scope', 'dedupe', 'output_parity'];
if (!review.checks || required.some(key => review.checks[key] !== 'pass')) errors.push('Independent review did not pass every required check');
if (errors.length) throw new Error(`Verification signing blocked:\n- ${errors.join('\n- ')}`);
const inaccessible = await checkSourceUrls(data.edition);
if (inaccessible.length) throw new Error(`Verification signing blocked by inaccessible sources:\n- ${inaccessible.join('\n- ')}`);
const signed = {
  schemaVersion: 1, verdict: 'pass', reportDate: data.date,
  payloadSha256: sha256(rawPayload), factRecordSha256: sha256(rawFacts),
  checkedAt: new Date().toISOString(), verifierId: review.verifierId,
  verifiedEventKeys: expected, checks: Object.fromEntries(required.map(key => [key, 'pass'])),
};
const signature = sign(null, Buffer.from(canonicalJson(signed)), createPrivateKey(privateKeyPem)).toString('base64');
await writeFile(outputPath, `${JSON.stringify({ ...signed, signature }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
console.log(`Signed independently reviewed report for ${data.date}; artifact written to ${outputPath}`);
