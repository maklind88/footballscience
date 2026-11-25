import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Publish only allowlisted operational attachments. The standard test log is
// kept separate from this portable evidence and may contain synthetic labels.
const allowed = new Set(['Sessions save chain metrics', 'Browser quota faults', 'Full app cold start outcome']);
const file = fileURLToPath(new URL('../../test-results/session-saving-chain.json', import.meta.url));
export default class SessionsSaveChainReporter {
  results = [];
  onTestEnd(test, result) {
    const evidence = [];
    for (const attachment of result.attachments) {
      if (!allowed.has(attachment.name) || attachment.contentType !== 'application/json') continue;
      const data = attachment.body || (attachment.path ? readFileSync(attachment.path) : null);
      if (data) evidence.push({ kind: attachment.name, result: JSON.parse(data.toString()) });
    }
    this.results.push({ test: test.title, status: result.status, durationMs: result.duration, evidence });
  }
  async onEnd(result) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ status: result.status, results: this.results }, null, 2) + '\n');
  }
}
