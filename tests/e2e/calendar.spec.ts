import { test, expect } from '@playwright/test';
const connection = {
  status: 'connected',
  canRead: true,
  canWrite: true,
  sessionId: 'synthetic-session',
  child: { value: 'synthetic-child', label: '合成孩子' },
  device: { value: 'synthetic-device', label: '合成设备' },
};
for (const theme of ['light', 'dark'])
  test(`整月总览、遗漏分类、日期下钻和读取失败 · ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.clock.setFixedTime(new Date('2026-10-17T04:00:00Z'));
    await page.addInitScript(
      (t) => localStorage.setItem('xueban.theme.v1', t),
      theme,
    );
    await page.route('**/api/v1/connection', (r) =>
      r.fulfill({ json: connection }),
    );
    let fail = false;
    const ranges: string[] = [];
    await page.route('**/api/v1/homework?*', (r) => {
      const url = new URL(r.request().url());
      ranges.push(url.searchParams.get('endDate') ?? '');
      const make = (id: string, date: string, status: string) => ({
        id,
        date,
        status,
        subject: 'math',
        content: '合成月历作业',
      });
      return fail
        ? r.fulfill({ status: 503, json: { error: { code: 'READ_FAILED' } } })
        : r.fulfill({
            json: {
              mode: 'real',
              items: [
                make('one', '2026-10-15', 'completed'),
                make('two', '2026-10-16', 'pending'),
                make('three', '2026-10-17', 'pending'),
              ],
            },
          });
    });
    if (testInfo.project.name === 'desktop')
      await page.setViewportSize({ width: 1440, height: 1080 });
    await page.goto('/calendar?date=2026-10-17');
    await expect(
      page.getByRole('heading', { name: '任务总览', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', {
        name: '2026-10-15，全部完成，共 1 项，已完成 1 项，未完成 0 项',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', {
        name: '2026-10-16，有遗漏，共 1 项，已完成 0 项，未完成 1 项',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', {
        name: '2026-10-17，待完成，共 1 项，已完成 0 项，未完成 1 项',
        exact: true,
      }),
    ).toBeVisible();
    expect(ranges).toContain('2026-10-31');
    if (process.env.XUEERSI_ARTIFACT_DIR)
      await page.screenshot({
        path: `${process.env.XUEERSI_ARTIFACT_DIR}/calendar-${testInfo.project.name}-${theme}.png`,
        fullPage: true,
      });
    await page.getByRole('button', { name: '全屏总览', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '退出全屏', exact: true }),
    ).toBeVisible();
    const calendar = page.getByRole('region', {
      name: '任务总览',
      exact: true,
    });
    await page.mouse.move(200, 400);
    await page.mouse.wheel(0, 5000);
    await expect
      .poll(() => calendar.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    await expect(
      page.getByRole('link', {
        name: '2026-10-31，无任务，共 0 项，已完成 0 项，未完成 0 项',
        exact: true,
      }),
    ).toBeInViewport();
    if (process.env.XUEERSI_ARTIFACT_DIR)
      await page.screenshot({
        path: `${process.env.XUEERSI_ARTIFACT_DIR}/calendar-fullscreen-bottom-${testInfo.project.name}-${theme}.png`,
      });
    await page.mouse.wheel(0, -5000);
    await expect.poll(() => calendar.evaluate((el) => el.scrollTop)).toBe(0);
    await page.getByRole('button', { name: '退出全屏', exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole('link', {
        name: '2026-10-16，有遗漏，共 1 项，已完成 0 项，未完成 1 项',
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/date=2026-10-16/);
    await page.goto('/calendar?date=2026-10-17');
    fail = true;
    await page.getByRole('button', { name: '刷新', exact: true }).click();
    await expect(
      page.getByText('本月作业读取失败', { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('本月统计')).toHaveCount(0);
  });
