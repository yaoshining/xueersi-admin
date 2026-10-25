import { test, expect } from '@playwright/test';
const c = {
  status: 'connected',
  canRead: true,
  canWrite: true,
  sessionId: 'synthetic-session',
  child: { value: 'synthetic-child', label: '合成孩子' },
  device: { value: 'synthetic-device', label: '合成设备' },
};
const item = {
  id: 'synthetic-task',
  subject: 'math',
  content: '合成删除与报告',
  date: '2026-10-17',
  status: 'pending',
  targetMinutes: 15,
  submissionRequirement: 'image',
};
for (const theme of ['light', 'dark']) {
  test(`删除预览、取消、明确确认与回读 · ${theme}`, async ({ page }) => {
    await page.addInitScript(
      (t) => localStorage.setItem('xueban.theme.v1', t),
      theme,
    );
    await page.route('**/api/v1/connection', (r) => r.fulfill({ json: c }));
    let deleted = false,
      writes = 0,
      previews = 0;
    await page.route('**/api/v1/homework?*', (r) =>
      r.fulfill({ json: { mode: 'real', items: deleted ? [] : [item] } }),
    );
    await page.route('**/api/v1/homework/delete/preview', (r) => {
      previews++;
      return r.fulfill({
        json: {
          ticketId: 'ticket',
          secret: 'synthetic-confirmation',
          expiresAt: Date.now() + 300000,
          summary: { item, child: '合成孩子', device: '合成设备' },
        },
      });
    });
    await page.route('**/api/v1/homework/delete/preview/ticket', (r) =>
      r.fulfill({ json: { ok: true } }),
    );
    await page.route('**/api/v1/homework/delete/confirm', (r) => {
      expect(r.request().postDataJSON().confirmed).toBe(true);
      writes++;
      deleted = true;
      return r.fulfill({ json: { status: 'accepted' } });
    });
    await page.goto('/homework/synthetic-task?date=2026-10-17');
    await page
      .getByRole('button', { name: '删除这条作业', exact: true })
      .click();
    const preview = page.getByRole('region', { name: '确认删除作业' });
    await expect(preview).toContainText('15 分钟 · 图片');
    expect(writes).toBe(0);
    await page.getByRole('button', { name: '取消删除', exact: true }).click();
    expect(writes).toBe(0);
    await page
      .getByRole('button', { name: '删除这条作业', exact: true })
      .click();
    await page
      .getByRole('button', { name: '确认永久删除', exact: true })
      .click();
    await expect(
      page.getByText('作业已删除，官方列表回读确认已移除。', { exact: true }),
    ).toBeVisible();
    expect(writes).toBe(1);
    expect(previews).toBe(2);
  });
  test(`完成报告图片音频视频、过期和错误 · ${theme}`, async ({ page }) => {
    await page.addInitScript(
      (t) => localStorage.setItem('xueban.theme.v1', t),
      theme,
    );
    await page.route('**/api/v1/connection', (r) => r.fulfill({ json: c }));
    await page.route('**/api/v1/homework?*', (r) =>
      r.fulfill({
        json: { mode: 'real', items: [{ ...item, status: 'completed' }] },
      }),
    );
    let state = 'media';
    await page.route('**/api/v1/homework/report?*', (r) =>
      state === 'error'
        ? r.fulfill({
            status: 503,
            json: { error: { code: 'REPORT_UNAVAILABLE' } },
          })
        : r.fulfill({
            json: {
              attachments:
                state === 'empty'
                  ? []
                  : [
                      {
                        kind: 'image',
                        state: 'available',
                        url: 'https://media.example.com/photo.svg',
                      },
                      {
                        kind: 'audio',
                        state: 'available',
                        url: 'https://media.example.com/audio.mp3',
                      },
                      {
                        kind: 'video',
                        state: 'available',
                        url: 'https://media.example.com/video.mp4',
                      },
                      { kind: 'image', state: 'expired' },
                    ],
            },
          }),
    );
    await page.route('https://media.example.com/photo.svg', (r) =>
      r.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="green"/></svg>',
      }),
    );
    await page.goto('/homework/synthetic-task?date=2026-10-17');
    const report = page.getByRole('region', { name: '孩子提交的内容' });
    await expect(
      report.getByRole('img', { name: '孩子提交的图片 1' }),
    ).toBeVisible();
    await expect(report.locator('audio')).toHaveAttribute('controls', '');
    await expect(report.locator('audio')).toHaveAttribute('preload', 'none');
    await expect(report.locator('video')).toHaveAttribute('preload', 'none');
    await expect(report.getByText('图片 4：附件已过期')).toBeVisible();
    await expect(
      page.getByRole('button', { name: '删除这条作业', exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    state = 'empty';
    await report.getByRole('button', { name: '刷新报告' }).click();
    await expect(report).toContainText('暂无提交附件');
    state = 'error';
    await report.getByRole('button', { name: '刷新报告' }).click();
    await expect(report).toContainText('完成报告读取失败');
  });
}
