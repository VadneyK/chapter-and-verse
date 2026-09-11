/**
 * Command line front end for the generator.
 *
 * Separate from generate.ts for the same reason verify-cli.ts is separate from
 * verify.ts: selftest.ts imports `generatePlan` and must not run the CLI when
 * it does, and a `process.argv[1]` guard cannot tell the difference under
 * vite-node, which replaces argv[1] with its own binary path.
 *
 *   npm run generate -- "understand Romans in 6 weeks"
 */
import { generatePlan } from './generate';
import { selectLlm } from './llm';

async function main() {
  const goal = process.argv.slice(2).join(' ').trim() || 'understand Romans in 6 weeks';
  const llm = selectLlm();
  console.log(`Goal: ${goal}`);
  console.log(`Mode: ${llm.mode}\n`);

  const { plan, trace, finalReport } = await generatePlan(goal, llm);

  console.log(
    `\nShipped ${plan.items.length} item(s) across ${plan.weeks} week(s). ` +
      `${finalReport.passCount} verified, ${finalReport.unverifiableCount} carrying a claim ` +
      `that cannot be confirmed, ${trace.dropped.length} dropped.`,
  );
  for (const d of trace.dropped) {
    console.log(`  dropped  ${d.id}  ${d.reference}  ${d.title}`);
  }
  console.log('\nWrote out/plan.json and out/generate-trace.json');
  console.log('Next:  npm run verify -- out/plan.json  &&  npm run report');
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
