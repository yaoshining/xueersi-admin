import { test, expect } from '@playwright/test';
test('默认断开、显式演示、移动端无横向溢出', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: '把每天的作业，安排清楚。' }),
  ).toBeVisible();
  await expect(
    page.getByText('尚未连接学而思账号', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('本机服务正常', { exact: true })).toBeVisible();
  await expect(page.getByText('阅读一篇短文并记录三个新词')).toHaveCount(0);
  await page.getByRole('button', { name: '查看演示作业', exact: true }).click();
  await expect(
    page.getByText('演示模式 · 全部内容均为合成数据', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('阅读一篇短文并记录三个新词')).toBeVisible();
  await expect(page.getByRole('button', { name: '布置新作业' })).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test('服务错误不会显示已连接或演示成功', async ({ page }) => {
  await page.route('**/api/v1/health', (route) =>
    route.fulfill({ status: 503, body: '{}' }),
  );
  await page.route('**/api/v1/connection', (route) =>
    route.fulfill({ status: 503, body: '{}' }),
  );
  await page.route('**/api/v1/demo/homework', (route) =>
    route.fulfill({ status: 503, body: '{}' }),
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
  await expect(page.getByText('阅读一篇短文并记录三个新词')).toHaveCount(0);
});
