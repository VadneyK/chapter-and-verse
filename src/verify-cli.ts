/**
 * Command line front end for the verifier.
 *
 * `npm run verify` checks the adversarial fixture. `npm run verify -- <path>`
 * checks any other plan file.
 *
 * This is a separate file from verify.ts on purpose. While the CLI lived in
 * the same module, every `import { verifyPlan }` from the generator re-ran the
 * demo and overwrote the report. Guarding on `process.argv[1]` does not fix
 * it either: vite-node replaces argv[1] with its own binary path, so the
 * guard never fires.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BuiltIndex } from './index-types';
import type { StudyPlan } from './schema';
import { printReport, verifyPlan } from './verify';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

export function loadIndex(): BuiltIndex {
  const file = path.join(ROOT, 'out', 'index.json');
  if (!fs.existsSync(file)) {
    console.error('No out/index.json. Run "npm run build" first.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function main() {
  const index = loadIndex();
  const arg = process.argv[2];
  const planPath = arg
    ? path.resolve(arg)
    : path.join(ROOT, 'fixtures', 'plan-that-slips-through.json');
  const plan: StudyPlan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

  const report = verifyPlan(index, plan);
  printReport(report);

  fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'out', 'verify-report.json'), JSON.stringify(report, null, 2));
  // The plan beside its report: report.ts needs item titles, and the report
  // itself carries only ids and references.
  fs.writeFileSync(path.join(ROOT, 'out', 'verified-plan.json'), JSON.stringify(plan, null, 2));
  console.log(`\nWrote out/verify-report.json`);

  if (report.failCount > 0 && !arg) {
    console.log(
      `\n(${report.failCount} failures on the adversarial fixture are the point of it. ` +
        `See fixtures/plan-that-slips-through.json.)`,
    );
  }
}

main();
