import { test, expect } from '@playwright/test';
test('名称、保存方式和失效重新登录提示，断开清除凭据', async ({
  page,
}, testInfo) => {
  let disconnected = false;
  await page.route('**/api/v1/connection', (r) =>
    r.fulfill({
      json: disconnected
        ? {
            status: 'disconnected',
            canRead: false,
            canWrite: false,
            reason: 'session-expired',
          }
        : {
            status: 'connected',
            canRead: true,
            canWrite: false,
            sessionId: 'synthetic-local',
            persistence: 'encrypted',
            verification: 'verified',
            renewal: 'login-required',
            child: { value: 'synthetic-child', label: '小禾（测试）' },
            device: { value: 'synthetic-device', label: '学习机（测试型号）' },
          },
    }),
  );
  await page.route('**/api/v1/session', (r) => {
    if (r.request().method() === 'DELETE') {
      disconnected = true;
      return r.fulfill({ json: { ok: true } });
    }
    return r.abort();
  });
  await page.goto('/settings');
  await expect(page.getByRole('combobox', { name: '当前孩子' })).toContainText(
    '小禾（测试）',
  );
  await expect(
    page.getByRole('combobox', { name: '目标学习机' }),
  ).toContainText('学习机（测试型号）');
  await expect(
    page.getByText('本机加密保存 · 重启自动恢复', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('官方会话失效时需重新登录', { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('persistent-session.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: '断开并删除本机会话' }).click();
  await expect(
    page
      .getByText('登录已失效，请重新登录官网并连接本机', { exact: true })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '断开并删除本机会话' }),
  ).toHaveCount(0);
});
for (const theme of ['light', 'dark']) {
  test(`Cookie 自动续期状态与官方拒绝后的登录提示 · ${theme}`, async ({
    page,
  }) => {
    await page.addInitScript(
      (t) => localStorage.setItem('xueban.theme.v1', t),
      theme,
    );
    let expired = false;
    await page.route('**/api/v1/connection', (r) =>
      r.fulfill({
        json: expired
          ? {
              status: 'disconnected',
              canRead: false,
              canWrite: false,
              reason: 'session-expired',
            }
          : {
              status: 'connected',
              canRead: true,
              canWrite: false,
              sessionId: 'synthetic-cookie-session',
              persistence: 'encrypted',
              verification: 'verified',
              renewal: 'automatic',
              child: { value: 'synthetic-child', label: '测试孩子' },
              device: { value: 'synthetic-device', label: '测试学习机' },
            },
      }),
    );
    await page.route('**/api/v1/homework?*', (r) => {
      expired = true;
      return r.fulfill({
        status: 401,
        json: { error: { code: 'SESSION_EXPIRED' } },
      });
    });
    await page.goto('/settings');
    await expect(
      page.getByText('使用时自动续期 · 失效后提示重新登录', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/令牌及已授权的续期 Cookie 加密保存在本机/),
    ).toBeVisible();
    await page.goto('/?date=2026-10-17');
    await expect(
      page
        .getByText('登录已失效，请重新登录官网并连接本机', { exact: true })
        .first(),
    ).toBeVisible();
  });
}
