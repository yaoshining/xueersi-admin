import { test, expect } from '@playwright/test';
test('完整草稿后端保存、跨浏览器读取和编辑', async ({
  page,
  browser,
}, testInfo) => {
  const content = `合成后端草稿-${testInfo.project.name}`;
  await page.goto('/drafts/new');
  await page.getByLabel('作业内容').fill(content);
  await page.getByRole('combobox', { name: '完成目标时长' }).click();
  await page.getByRole('option', { name: '20 分钟', exact: true }).click();
  await page.getByRole('combobox', { name: '作业提交要求' }).click();
  await page.getByRole('option', { name: '图片', exact: true }).click();
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  const card = page.locator('[data-slot="card"]').filter({ hasText: content });
  await expect(card).toContainText('20 分钟');
  await expect(card).toContainText('图片');
  const second = await browser.newContext();
  try {
    const other = await second.newPage();
    await other.goto('http://127.0.0.1:3107/drafts');
    const saved = other
      .locator('[data-slot="card"]')
      .filter({ hasText: content });
    await saved.getByRole('link', { name: '编辑草稿' }).click();
    await expect(
      other.getByRole('combobox', { name: '完成目标时长' }),
    ).toContainText('20 分钟');
    await expect(
      other.getByRole('combobox', { name: '作业提交要求' }),
    ).toContainText('图片');
  } finally {
    await second.close();
  }
  await card.getByRole('button', { name: '删除草稿', exact: true }).click();
  await card.getByRole('button', { name: '确认删除' }).click();
  await expect(card).toHaveCount(0);
});
test('长表单返回首页时小书在视口内', async ({ page }) => {
  await page.goto('/drafts/new');
  await page
    .getByRole('button', { name: '保存草稿', exact: true })
    .scrollIntoViewIfNeeded();
  await page
    .getByRole('link', { name: /^(作业|作业安排)$/ })
    .filter({ visible: true })
    .click();
  await expect(page.locator('[data-book-scene]')).toBeInViewport();
});

test('旧草稿显式导入后原件仍在，缺失选项保持未设置', async ({
  page,
}, testInfo) => {
  const id = `legacy-${testInfo.project.name}`;
  await page.addInitScript(
    (id) =>
      localStorage.setItem(
        'xueban.drafts.v1',
        JSON.stringify([
          {
            id,
            childId: 'demo-child-a',
            subject: 'math',
            date: '2026-10-17',
            content: id,
          },
        ]),
      ),
    id,
  );
  await page.goto('/drafts');
  await page.getByRole('button', { name: '导入到本机后端' }).click();
  await expect(
    page.getByText('已导入，浏览器原件仍保留作为备份'),
  ).toBeVisible();
  const card = page.locator('[data-slot="card"]').filter({ hasText: id });
  await expect(card).toContainText('目标时长：未设置');
  expect(
    await page.evaluate(() => localStorage.getItem('xueban.drafts.v1')),
  ).toContain(id);
  await card.getByRole('button', { name: '删除草稿', exact: true }).click();
  await card.getByRole('button', { name: '确认删除' }).click();
  await expect(card).toHaveCount(0);
});

for (const theme of ['light', 'dark'])
  test(`布置作业表单 ${theme} 主题完整选项和布局`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({
      colorScheme: theme as 'light' | 'dark',
      reducedMotion: 'reduce',
    });
    await page.goto('/drafts/new');
    await page.getByRole('combobox', { name: '完成目标时长' }).click();
    for (const label of [
      '不限',
      '10 分钟',
      '15 分钟',
      '20 分钟',
      '30 分钟',
      '40 分钟',
      '50 分钟',
      '60 分钟',
    ])
      await expect(
        page.getByRole('option', { name: label, exact: true }),
      ).toBeAttached();
    await page.getByRole('option', { name: '60 分钟', exact: true }).click();
    await page.getByRole('combobox', { name: '作业提交要求' }).click();
    for (const label of ['不限', '图片', '音频', '视频', '音频或视频'])
      await expect(
        page.getByRole('option', { name: label, exact: true }),
      ).toBeAttached();
    await page.getByRole('option', { name: '音频或视频', exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(`draft-form-${theme}.png`),
      fullPage: true,
    });
  });
