import { test, expect } from '@playwright/test';
const reading = '阅读一篇短文并记录三个新词';
async function enterDemo(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '查看演示作业', exact: true }).click();
  await expect(
    page.getByRole('link', { name: `查看作业：${reading}` }),
  ).toBeVisible();
}
test('默认断开、显式演示、响应式 v3', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: '作业安排', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('尚未连接学而思账号', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('本机服务正常', { exact: true })).toBeVisible();
  await expect(page.getByText(reading, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '查看演示作业', exact: true }).click();
  await expect(
    page.getByText('演示模式 · 全部内容均为合成数据', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: `查看作业：${reading}` }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('日期和孩子筛选、详情刷新与返回', async ({ page }) => {
  await enterDemo(page);
  await page.getByRole('link', { name: `查看作业：${reading}` }).click();
  await expect(page.getByRole('region', { name: '作业详情' })).toContainText(
    reading,
  );
  await page.reload();
  await expect(page.getByRole('region', { name: '作业详情' })).toContainText(
    reading,
  );
  await page.getByRole('link', { name: '返回作业列表' }).click();
  await page.getByRole('button', { name: '上一周' }).click();
  await expect(
    page.getByText('这一天还没有作业', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: '作业详情' })).toHaveCount(0);
  await page.getByRole('button', { name: '今天', exact: true }).click();
  await expect(
    page.getByRole('link', { name: `查看作业：${reading}` }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: '当前孩子' }).click();
  await page.getByRole('option', { name: '示例孩子 B' }).click();
  await expect(
    page.getByText('这一天还没有作业', { exact: true }),
  ).toBeVisible();
});
test('服务错误与重试保留真实边界', async ({ page }) => {
  await page.route('**/api/v1/health', (r) =>
    r.fulfill({ status: 503, body: '{}' }),
  );
  await page.route('**/api/v1/connection', (r) =>
    r.fulfill({ status: 503, body: '{}' }),
  );
  await page.route('**/api/v1/demo/homework', (r) =>
    r.fulfill({ status: 503, body: '{}' }),
  );
  await page.goto('/');
  await expect(page.getByText('本机服务不可用', { exact: true })).toBeVisible();
  await expect(
    page.getByText('连接状态读取失败', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '查看演示作业', exact: true }).click();
  await expect(
    page.getByText('演示数据加载失败', { exact: true }),
  ).toBeVisible();
  await page.unroute('**/api/v1/demo/homework');
  await page.getByRole('button', { name: '重新加载' }).click();
  await expect(
    page.getByRole('link', { name: `查看作业：${reading}` }),
  ).toBeVisible();
});
test('主题记忆和跟随系统', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/settings');
  await page.getByRole('button', { name: '深色', exact: true }).last().click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page
    .getByRole('button', { name: '跟随系统', exact: true })
    .last()
    .click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/dark/);
});
test('草稿校验、保存、编辑、重载和删除', async ({ page }, testInfo) => {
  const content = `合成测试阅读-${testInfo.project.name}`;
  await page.goto('/drafts/new');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(page.getByText('请输入作业内容', { exact: true })).toBeVisible();
  await page.getByLabel('作业内容').fill(content);
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(page).toHaveURL(/\/drafts\?/);
  let card = page.locator('[data-slot="card"]').filter({ hasText: content });
  await expect(card).toBeVisible();
  await page.reload();
  await card.getByRole('link', { name: '编辑草稿' }).click();
  await page.getByLabel('作业内容').fill(content + '更新');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  card = page
    .locator('[data-slot="card"]')
    .filter({ hasText: content + '更新' });
  await card.getByRole('link', { name: '同步到学习机' }).click();
  await page.getByRole('button', { name: '生成提交预览' }).click();
  await expect(
    page.getByText('草稿孩子与当前授权孩子不一致，请核对账号和草稿。'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '确认提交这条作业' }),
  ).toHaveCount(0);
  await page.getByRole('link', { name: '查看作业草稿' }).click();
  await card.getByRole('button', { name: '删除草稿', exact: true }).click();
  await card.getByRole('button', { name: '确认删除' }).click();
  await expect(card).toHaveCount(0);
});
test('草稿存储失败不清空表单', async ({ page }) => {
  await page.route('**/api/v1/drafts', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 503, json: {} })
      : route.continue(),
  );
  await page.goto('/drafts/new');
  await page.getByLabel('作业内容').fill('合成测试：保存失败。');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('无法保存');
  await expect(page.getByLabel('作业内容')).toHaveValue('合成测试：保存失败。');
});
test('桌面关闭选中详情后可重新打开', async ({ page, isMobile }) => {
  test.skip(isMobile, '移动端使用独立详情与返回导航');
  await enterDemo(page);
  await page.getByRole('link', { name: `查看作业：${reading}` }).click();
  await page.getByRole('button', { name: '关闭详情' }).click();
  await expect(page.getByRole('region', { name: '作业详情' })).toHaveCount(0);
  await page.getByRole('link', { name: `查看作业：${reading}` }).click();
  await expect(page.getByRole('region', { name: '作业详情' })).toBeVisible();
});
test('移动快捷主题切换基于实际系统外观', async ({ page, isMobile }) => {
  test.skip(!isMobile, '桌面直接使用三态主题选择器');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.getByRole('button', { name: '切换为浅色主题' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});
