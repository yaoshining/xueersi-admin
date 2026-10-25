import { test, expect } from '@playwright/test';
const connection = {
  status: 'connected',
  canRead: true,
  canWrite: false,
  sessionId: 'synthetic-session',
  child: { value: 'authorized-child', label: '已授权孩子' },
  device: { value: 'authorized-device', label: '已授权学习机' },
};
test('真实只读列表和详情，错误后不保留成功缓存或混入演示', async ({ page }) => {
  await page.route('**/api/v1/connection', (r) =>
    r.fulfill({ json: connection }),
  );
  let failing = false;
  await page.route('**/api/v1/homework?*', (r) =>
    failing
      ? r.fulfill({ status: 503, json: { error: { code: 'READ_FAILED' } } })
      : r.fulfill({
          json: {
            mode: 'real',
            items: [
              {
                id: 'synthetic-real',
                subject: 'math',
                content: '合成真实模式测试',
                date: '2026-10-17',
                status: 'pending',
              },
            ],
          },
        }),
  );
  await page.goto('/?date=2026-10-17');
  await expect(
    page.getByText('真实作业 · 只读', { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: '查看作业：合成真实模式测试' }).click();
  await expect(page.getByRole('region', { name: '作业详情' })).toContainText(
    '官方作业 · 只读',
  );
  await page.getByRole('link', { name: '返回作业列表' }).click();
  failing = true;
  await page.getByRole('button', { name: '刷新作业', exact: true }).click();
  await expect(
    page.getByText('真实作业读取失败', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: '查看作业：合成真实模式测试' }),
  ).toHaveCount(0);
  await expect(
    page.getByText('阅读一篇短文并记录三个新词', { exact: true }),
  ).toHaveCount(0);
});

for (const theme of ['light', 'dark'])
  test(`官方详情显示时长和提交要求 · ${theme}`, async ({ page }) => {
    await page.addInitScript(
      (value) => localStorage.setItem('xueban.theme.v1', value),
      theme,
    );
    await page.route('**/api/v1/connection', (r) =>
      r.fulfill({ json: connection }),
    );
    let options: object = { targetMinutes: 15, submissionRequirement: 'image' };
    await page.route('**/api/v1/homework?*', (r) =>
      r.fulfill({
        json: {
          mode: 'real',
          items: [
            {
              id: 'synthetic-options',
              subject: 'math',
              content: '合成选项回读',
              date: '2026-10-17',
              status: 'pending',
              ...options,
            },
          ],
        },
      }),
    );
    await page.goto('/homework/synthetic-options?date=2026-10-17');
    const details = page.getByRole('region', { name: '作业详情' });
    await expect(details).toContainText('目标时长');
    await expect(details).toContainText('15 分钟');
    await expect(details).toContainText('提交要求');
    await expect(details).toContainText('图片');
    options = { targetMinutes: 0, submissionRequirement: 'none' };
    await page.reload();
    await expect(details.getByText('不限', { exact: true })).toHaveCount(2);
    options = {};
    await page.reload();
    await expect(
      details.getByText('未提供或暂不支持', { exact: true }),
    ).toHaveCount(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
