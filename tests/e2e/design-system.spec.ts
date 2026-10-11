import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { uiLogin } from './helpers';

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'celular', width: 390, height: 844 },
];

for (const vp of viewports) {
  test.describe(`design system em ${vp.name} (${vp.width}px)`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('renderiza as seções principais', async ({ page }) => {
      await page.goto('/design-system');
      await expect(page.getByRole('heading', { level: 1, name: 'Design system' })).toBeVisible();
      for (const h of [
        'Cores',
        'Tipografia (Inter)',
        'Botões e confirmação',
        'Formulário',
        'Tabela',
      ]) {
        await expect(page.getByRole('heading', { name: h })).toBeVisible();
      }
      await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
    });

    test('não tem rolagem horizontal da página', async ({ page }) => {
      await page.goto('/design-system');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test('não tem violações de acessibilidade (axe, WCAG A/AA)', async ({ page }) => {
      await page.goto('/design-system');
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  });
}

test('diálogo de confirmação abre, cancela e confirma', async ({ page }) => {
  await page.goto('/design-system');
  await page.getByRole('button', { name: /Excluir \(abre confirmação\)/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Excluir item?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Confirmação recebida')).toHaveCount(0);

  await page.getByRole('button', { name: /Excluir \(abre confirmação\)/ }).click();
  await dialog.getByRole('button', { name: 'Excluir' }).click();
  await expect(page.getByText('Confirmação recebida')).toBeVisible();
});

test('rota inexistente: sem sessão vai ao login; autenticado vê 404 em português', async ({
  page,
}) => {
  await page.goto('/nao-existe');
  await expect(page).toHaveURL(/\/login\?next=%2Fnao-existe/);
  await uiLogin(page, 'dona.a@example.test');
  const res = await page.goto('/nao-existe');
  expect(res?.status()).toBe(404);
  await expect(page.getByText('Página não encontrada')).toBeVisible();
});

test('cabeçalhos de segurança estão presentes', async ({ request }) => {
  const res = await request.get('/');
  const h = res.headers();
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['x-powered-by']).toBeUndefined();
});
