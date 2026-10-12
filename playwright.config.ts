import { config as loadEnv } from 'dotenv';
import { defineConfig } from '@playwright/test';

loadEnv({ quiet: true });

// No ambiente de nuvem o Chromium já vem instalado; PW_CHROMIUM_PATH permite apontar para ele.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const PORT = 3100;
const testDb = process.env.TEST_DATABASE_URL;
if (!testDb) throw new Error('TEST_DATABASE_URL é obrigatório para os testes E2E.');

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  workers: 1, // os testes compartilham um banco de testes com estado
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: { executablePath },
  },
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    // Nunca reutilizar: o servidor precisa apontar para o banco de testes.
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      NODE_ENV: 'production',
      DATABASE_URL: testDb,
      APP_URL: `http://localhost:${PORT}`,
      TRUST_PROXY: 'false',
      // Servidor HTTP local do teste (tests/e2e/stage12-ui.spec.ts) no lugar do serviço de IA
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:3199',
    },
  },
});
