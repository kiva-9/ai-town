import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { evaluateNpcs, evaluationMarkdown } from '../convex/npc/evaluation';
async function main() {
  const args = process.argv.slice(2);
  const options: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--seed', '--steps', '--out'].includes(args[i]) || !args[i + 1])
      throw new Error(
        'Usage: npm run evaluate:npcs -- --seed example --steps 80 --out reports/npcs',
      );
    options[args[i]] = args[i + 1];
  }
  const report = evaluateNpcs(
    options['--seed'],
    options['--steps'] === undefined ? undefined : Number(options['--steps']),
  );
  const output = resolve(options['--out'] ?? 'reports/npcs');
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, 'evaluation.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(resolve(output, 'evaluation.md'), evaluationMarkdown(report));
  console.log(
    `Wrote ${output}/evaluation.json and evaluation.md. Hybrid = utility fallback; no live API requests.`,
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
