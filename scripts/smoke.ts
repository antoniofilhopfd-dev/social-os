import 'dotenv/config';
import { parseArgs } from 'node:util';
import { runSmoke } from '../src/core/smoke';

/**
 * Teste de fumaça pós-implantação, de fora para dentro (somente leitura, sem login):
 *   npm run smoke -- --url https://app.seudominio.com.br
 */
async function main() {
  const { values } = parseArgs({ options: { url: { type: 'string' } } });
  const url = values.url ?? process.env.APP_URL;
  if (!url) {
    console.error('Informe --url ou defina APP_URL.');
    process.exit(2);
  }
  const checks = await runSmoke(url);
  for (const c of checks) console.log(`${c.ok ? '✔' : '✘'} ${c.name} — ${c.detail}`);
  const failed = checks.filter((c) => !c.ok);
  console.log(
    `\n${failed.length === 0 ? 'TUDO CERTO' : `${failed.length} verificação(ões) falharam`}`,
  );
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
