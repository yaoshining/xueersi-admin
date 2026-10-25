import { test, expect } from '@playwright/test';
test('完整预览、取消和明确确认；桌面及手机均不提前提交', async ({ page }) => {
  let writes = 0;
  const draft = {
    id: 'test-sync',
    childId: 'test-child',
    subject: 'math',
    date: '2026-10-17',
    content: '合成作业：完成练习',
    targetMinutes: 15,
    submissionRequirement: 'audio-or-video',
  };
  const summary = {
    draft,
    child: '测试孩子',
    device: '测试学习机',
    typeLabel: '数学 · 其他',
  };
  await page.route('**/api/v1/sync/records', (r) =>
    r.fulfill({ json: { items: [] } }),
  );
  await page.route('**/api/v1/sync/preview', (r) =>
    r.fulfill({
      json: {
        ticketId: 'test-ticket',
        secret: 'synthetic',
        expiresAt: Date.now() + 300000,
        summary,
      },
    }),
  );
  await page.route('**/api/v1/sync/preview/*', (r) =>
    r.fulfill({ json: { ok: true } }),
  );
  await page.route('**/api/v1/sync/confirm', (r) => {
    writes++;
    return r.fulfill({
      json: {
        id: 'test-job',
        createdAt: Date.now(),
        summary,
        status: 'accepted',
      },
    });
  });
  await page.goto('/sync?draft=test-sync');
  await page.getByRole('button', { name: '生成提交预览' }).click();
  await expect(page.getByText('15 分钟', { exact: true })).toBeVisible();
  await expect(page.getByText('音频或视频', { exact: true })).toBeVisible();
  await expect(page.getByText('测试学习机', { exact: true })).toBeVisible();
  expect(writes).toBe(0);
  await page.getByRole('button', { name: '取消本次提交' }).click();
  expect(writes).toBe(0);
  await page.getByRole('button', { name: '生成提交预览' }).click();
  await page.getByRole('button', { name: '确认提交这条作业' }).click();
  await expect(
    page.getByText('官方已接受，学习机接收情况待核对', { exact: true }),
  ).toBeVisible();
  expect(writes).toBe(1);
});
test('演示模式禁止真实预览', async ({ page }) => {
  await page.goto('/sync?demo=1&draft=test');
  await expect(
    page.getByRole('button', { name: '生成提交预览' }),
  ).toBeDisabled();
});

test('深色主题中不确定结果不自动重发', async ({ page }) => {
  let writes = 0;
  await page.addInitScript(() =>
    localStorage.setItem('xueban.theme.v1', 'dark'),
  );
  const summary = {
    draft: {
      id: 'test-sync',
      childId: 'test-child',
      subject: 'math',
      date: '2026-10-17',
      content: '合成作业',
      targetMinutes: 0,
      submissionRequirement: 'none',
    },
    child: '测试孩子',
    device: '测试学习机',
    typeLabel: '数学 · 其他',
  };
  await page.route('**/api/v1/sync/records', (r) =>
    r.fulfill({ json: { items: [] } }),
  );
  await page.route('**/api/v1/sync/preview', (r) =>
    r.fulfill({
      json: {
        ticketId: 'test',
        secret: 'synthetic',
        expiresAt: Date.now() + 300000,
        summary,
      },
    }),
  );
  await page.route('**/api/v1/sync/confirm', (r) => {
    writes++;
    return r.fulfill({
      json: { id: 'test', createdAt: Date.now(), status: 'unknown', summary },
    });
  });
  await page.goto('/sync?draft=test-sync');
  await page.getByRole('button', { name: '生成提交预览' }).click();
  await page.getByRole('button', { name: '确认提交这条作业' }).click();
  await expect(
    page.getByText('结果不确定，请在学习机核对，勿重复提交', { exact: true }),
  ).toBeVisible();
  expect(writes).toBe(1);
  await expect(
    page.getByRole('button', { name: '确认提交这条作业' }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('从旧预览返回草稿再选另一条时，不复用旧草稿标识', async ({ page }) => {
  await page.route('**/api/v1/drafts', (r) =>
    r.fulfill({
      json: {
        items: [
          {
            id: 'new-draft',
            childId: 'test-child',
            subject: 'math',
            date: '2026-10-17',
            content: '另一条合成作业',
            targetMinutes: 15,
            submissionRequirement: 'image',
          },
        ],
      },
    }),
  );
  await page.route('**/api/v1/sync/records', (r) =>
    r.fulfill({ json: { items: [] } }),
  );
  await page.goto('/sync?draft=old-draft');
  await page.getByRole('link', { name: '查看作业草稿' }).click();
  await page.getByRole('link', { name: '同步到学习机' }).click();
  expect(new URL(page.url()).searchParams.getAll('draft')).toEqual([
    'new-draft',
  ]);
});
