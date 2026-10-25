import { test, expect } from '@playwright/test';
const connection = {
  status: 'connected',
  canRead: true,
  canWrite: false,
  sessionId: 'synthetic-session',
  child: { value: 'synthetic-child', label: '合成孩子' },
  device: { value: 'synthetic-device', label: '合成设备' },
};
for (const theme of ['light', 'dark'])
  test(`月历直接显示摘要、手机聚合和页内完整清单 · ${theme}`, async ({
    page,
    isMobile,
  }, testInfo) => {
    await page.clock.setFixedTime(new Date('2026-10-17T04:00:00Z'));
    await page.addInitScript(
      (t) => localStorage.setItem('xueban.theme.v1', t),
      theme,
    );
    if (!isMobile) await page.setViewportSize({ width: 1440, height: 1080 });
    await page.route('**/api/v1/connection', (r) =>
      r.fulfill({ json: connection }),
    );
    const long = '预习课文并记录问题。'.repeat(50);
    const items = [
      {
        id: 'single',
        subject: 'english',
        content: '朗读英语对话',
        date: '2026-10-15',
        status: 'completed',
      },
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `many-${i}`,
        subject: i % 2 ? 'chinese' : 'math',
        content: i === 4 ? long : `完成第 ${i + 1} 组练习`,
        date: '2026-10-17',
        status: i === 0 ? 'completed' : 'pending',
      })),
    ];
    let reads = 0,
      writes = 0;
    page.on('request', (r) => {
      if (r.method() !== 'GET' && r.url().includes('/api/')) writes++;
    });
    await page.route('**/api/v1/homework?*', (r) => {
      reads++;
      return r.fulfill({ json: { mode: 'real', items } });
    });
    await page.goto('/calendar?date=2026-10-17');
    await expect(page.locator('.month-days')).toBeVisible();
    const progress = page.getByRole('progressbar', {
      name: '本月作业完成进度',
    });
    await expect(progress).toHaveAttribute('value', '2');
    await expect(progress).toHaveAttribute('max', '6');
    await expect(progress).toHaveAttribute(
      'aria-valuetext',
      '已完成 2 / 6 项（33%）',
    );
    expect(
      await page
        .locator('.month-days')
        .evaluate(
          (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length,
        ),
    ).toBe(7);
    await expect(
      page.getByRole('link', { name: '查看作业：朗读英语对话', exact: true }),
    ).toBeVisible();
    if (!isMobile) {
      await expect(
        page.getByText('完成第 2 组练习', { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('link', {
          name: '查看作业：完成第 1 组练习',
          exact: true,
        }),
      ).toHaveCount(0);
    }
    const more = page.getByRole('button', {
      name: isMobile
        ? '展开 2026-10-17 的全部 5 项任务'
        : '展开 2026-10-17 的全部 5 项任务，另有 2 项',
    });
    await expect(more).toBeVisible();
    if (process.env.XUEERSI_ARTIFACT_DIR)
      await page.screenshot({
        path: `${process.env.XUEERSI_ARTIFACT_DIR}/calendar-preview-${testInfo.project.name}-${theme}.png`,
        fullPage: true,
      });
    if (!isMobile) {
      await page.setViewportSize({ width: 768, height: 1024 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(more).toBeVisible();
      expect(
        await page
          .locator('.month-days')
          .evaluate(
            (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length,
          ),
      ).toBe(7);
      expect(
        await page
          .locator('.calendar-task-meta > span:first-child')
          .evaluateAll((nodes) =>
            nodes.every(
              (el) =>
                el.getBoundingClientRect().height <=
                parseFloat(getComputedStyle(el).lineHeight) + 1,
            ),
          ),
      ).toBe(true);
      if (process.env.XUEERSI_ARTIFACT_DIR)
        await page.screenshot({
          path: `${process.env.XUEERSI_ARTIFACT_DIR}/calendar-preview-tablet-${theme}.png`,
          fullPage: true,
        });
      await page.setViewportSize({ width: 1440, height: 1080 });
    }
    const before = page.url(),
      readCount = reads;
    await more.click();
    const panel = page.getByRole('region', { name: '2026-10-17 的全部任务' });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(long);
    await expect(panel.getByRole('link', { name: /查看作业/ })).toHaveCount(5);
    expect(page.url()).toBe(before);
    expect(reads).toBe(readCount);
    expect(writes).toBe(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await panel.getByRole('button', { name: '关闭当天任务' }).click();
    await expect(panel).toHaveCount(0);
    await expect(more).toBeFocused();
    await more.click();
    await page.getByRole('button', { name: '下个月', exact: true }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByText('本月暂无任务', { exact: true })).toBeVisible();
    await expect(progress).toHaveCount(0);
  });
