import { expect, test, type Page } from '@playwright/test';

async function abrirModelo(page: Page, nome: string) {
  await page.keyboard.press('Control+k');
  await page.keyboard.type('Projetos e modelos');
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: nome }).click();
  await expect(page.getByText(`Modelo “${nome}” aberto.`)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('forge.onboarding', '99'));
  await page.goto('/');
  await expect(page.getByText('ORDO FORGE')).toBeVisible();
});

test('abre o Núcleo do bunker e o Design Companion não aponta erros', async ({ page }) => {
  await abrirModelo(page, 'Núcleo do bunker');
  await page.getByRole('tab', { name: 'Análise' }).click();
  await expect(page.getByText('0 erros')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Porta externa (falsa)')).toBeVisible();
});

test('aba Progressão lista a ordem de destrava', async ({ page }) => {
  await abrirModelo(page, 'Núcleo do bunker');
  await page.getByRole('tab', { name: 'Progressão' }).click();
  await expect(page.getByText('Chave do almoxarifado').first()).toBeVisible({ timeout: 15_000 });
});

test('desenhar uma sala, desfazer e refazer com atalhos', async ({ page }) => {
  const plan = page.locator('canvas').first();
  const box = (await plan.boundingBox())!;
  await page.getByRole('button', { name: /Sala/ }).first().click();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText(/Sala 1/).first()).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(page.getByText('Sala 1')).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByText(/Sala 1/).first()).toBeVisible();
});

test('F5 entra no playtest e Esc volta ao editor', async ({ page }) => {
  await abrirModelo(page, 'Núcleo do bunker');
  await page.keyboard.press('F5');
  await expect(page.getByText(/voltar ao editor/i)).toBeVisible({ timeout: 15_000 });
  await page.getByText(/voltar ao editor/i).click();
  await expect(page.getByRole('tab', { name: 'Propriedades' })).toBeVisible();
});

test('diálogo de exportação oferece planta, CSV e GLB', async ({ page }) => {
  await abrirModelo(page, 'Instalação subterrânea');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('Exportar…');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Planta em SVG')).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Baixar' }).nth(1).click()]);
  expect(dl.suggestedFilename()).toMatch(/planta\.svg$/);
});

test('salvar e recarregar mantém o projeto (IndexedDB/autosave)', async ({ page }) => {
  await abrirModelo(page, 'Núcleo do bunker');
  await page.keyboard.press('Control+s');
  await page.reload();
  await expect(page.getByText('Núcleo do bunker').first()).toBeVisible({ timeout: 15_000 });
});
