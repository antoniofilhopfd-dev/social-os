import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

// Uso: SCREENSHOT_BASE_URL=http://localhost:3100 npm run screenshots
const base = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:3100';
const outDir = 'screenshots/etapa-01';
const sizes = [
  ['desktop-1440', 1440, 900],
  ['tablet-768', 768, 1024],
  ['celular-390', 390, 844],
] as const;

async function main() {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM_PATH || undefined,
  });
  for (const [name, width, height] of sizes) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(`${base}/design-system`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: `${outDir}/design-system-${name}.png`, fullPage: true });
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${base}/design-system`);
  await page.getByRole('button', { name: /Excluir \(abre confirmação\)/ }).click();
  await page.screenshot({ path: `${outDir}/dialogo-confirmacao-celular-390.png` });
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
