import { test, expect, type Page } from '@playwright/test';
const drafts = [1, 2, 3, 4].map((n) => ({
  id: `batch-${n}`,
  childId: 'batch-child',
  subject: 'math',
  date: '2026-10-19',
  content: `合成批量练习 ${n}`,
  targetMinutes: n === 2 ? 20 : 15,
  submissionRequirement: n === 2 ? 'audio' : 'image',
}));
const summary = (n: number) => ({
  draft: drafts[n - 1],
  child: '合成孩子',
  device: '合成学习机',
  typeLabel: '数学 · 其他',
});
async function mock(page: Page, status = 'accepted') {
  const records = [
    { id: 'old-record', createdAt: 1, status: 'accepted', summary: summary(4) },
  ];
  let confirms = 0;
  let previews = 0;
  await page.route('**/api/v1/connection', (r) =>
    r.fulfill({
      json: {
        status: 'connected',
        canRead: true,
        canWrite: true,
        sessionId: 'synthetic-session',
        child: { value: 'batch-child', label: '合成孩子' },
        device: { value: 'batch-device', label: '合成学习机' },
      },
    }),
  );
  await page.route('**/api/v1/drafts', (r) =>
    r.fulfill({
      json: {
        items: drafts.filter(
          (d) =>
            !records.some(
              (x) => x.status === 'accepted' && x.summary.draft.id === d.id,
            ),
        ),
      },
    }),
  );
  await page.route('**/api/v1/sync/records', (r) =>
    r.fulfill({ json: { items: records } }),
  );
  await page.route('**/api/v1/sync/batch/preview', (r) => {
    previews++;
    const ids = r.request().postDataJSON().draftIds as string[];
    return r.fulfill({
      json: {
        ticketId: 'synthetic-ticket',
        secret: 'synthetic-confirmation',
        expiresAt: Date.now() + 300000,
        summaries: ids.map((id) => summary(Number(id.split('-')[1]))),
      },
    });
  });
  await page.route('**/api/v1/sync/batch/preview/*', (r) =>
    r.fulfill({ json: { ok: true } }),
  );
  await page.route('**/api/v1/sync/batch/confirm', (r) => {
    confirms++;
    expect(r.request().postDataJSON()).toEqual({
      ticketId: 'synthetic-ticket',
      secret: 'synthetic-confirmation',
      confirmed: true,
    });
    const items = [1, 2, 3].map((n) => {
      const result =
        n === 1
          ? 'accepted'
          : n === 2
            ? status
            : status === 'accepted'
              ? 'accepted'
              : 'not_sent';
      if (result === 'not_sent')
        return { draftId: `batch-${n}`, status: result };
      const record = {
        id: `record-${n}`,
        createdAt: 100 + n,
        status: result,
        summary: summary(n),
      };
      records.push(record);
      return { draftId: `batch-${n}`, status: result, record };
    });
    return r.fulfill({ json: { items } });
  });
  return {
    get confirms() {
      return confirms;
    },
    get previews() {
      return previews;
    },
  };
}
for (const theme of ['light', 'dark'] as const) {
  test(`批量选择、完整预览、取消及一次确认；${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const requests = await mock(page);
    await page.goto('/drafts?child=batch-child&date=2026-10-19');
    await expect(page.getByText('合成批量练习 4', { exact: true })).toHaveCount(
      0,
    );
    await page.getByRole('button', { name: /已同步/ }).click();
    await expect(
      page.getByText('合成批量练习 4', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/目标时长：15 分钟/)).toBeVisible();
    await page.screenshot({
      path: `outputs/batch-sync-${testInfo.project.name}-${theme}-synced.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: /待同步/ }).click();
    await page
      .getByRole('button', { name: '全选可同步草稿', exact: true })
      .click();
    await page
      .getByRole('button', { name: '批量同步（3）', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: '确认同步这 3 条作业', exact: true }),
    ).toBeVisible();
    for (const n of [1, 2, 3])
      await expect(
        page.getByText(`合成批量练习 ${n}`, { exact: true }),
      ).toBeVisible();
    await expect(page.getByText('20 分钟', { exact: true })).toBeVisible();
    await expect(page.getByText('音频', { exact: true })).toBeVisible();
    await page.screenshot({
      path: `outputs/batch-sync-${testInfo.project.name}-${theme}-preview.png`,
      fullPage: true,
    });
    expect(requests.confirms).toBe(0);
    await page
      .getByRole('button', { name: '取消批量同步', exact: true })
      .click();
    expect(requests.confirms).toBe(0);
    await expect(page.getByRole('heading', { name: '作业草稿' })).toBeVisible();
    await page
      .getByRole('button', { name: '全选可同步草稿', exact: true })
      .click();
    await page
      .getByRole('button', { name: '批量同步（3）', exact: true })
      .click();
    await page
      .getByRole('button', { name: '确认同步这 3 条作业', exact: true })
      .click();
    await expect(
      page.getByText('已接受 3 条 · 待核对 0 条 · 失败 0 条 · 未发送 0 条'),
    ).toBeVisible();
    expect(requests.confirms).toBe(1);
    await page.getByRole('link', { name: '返回草稿列表', exact: true }).click();
    await expect(page.getByText('合成批量练习 1', { exact: true })).toHaveCount(
      0,
    );
    await page.getByRole('button', { name: /已同步/ }).click();
    await expect(
      page.getByText('合成批量练习 1', { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
test('部分结果不自动重试，未知项回列表后不可选择', async ({ page }) => {
  const r = await mock(page, 'unknown');
  await page.goto('/drafts?child=batch-child&date=2026-10-19');
  await page
    .getByRole('button', { name: '全选可同步草稿', exact: true })
    .click();
  await page
    .getByRole('button', { name: '批量同步（3）', exact: true })
    .click();
  await page
    .getByRole('button', { name: '确认同步这 3 条作业', exact: true })
    .click();
  await expect(
    page.getByText('已接受 1 条 · 待核对 1 条 · 失败 0 条 · 未发送 1 条'),
  ).toBeVisible();
  expect(r.confirms).toBe(1);
  await page.getByRole('link', { name: '返回草稿列表', exact: true }).click();
  const card = page
    .locator('[data-slot=card]')
    .filter({ hasText: '合成批量练习 2' });
  await expect(card.getByRole('button', { name: '选择草稿' })).toBeDisabled();
  await expect(card).toContainText('待核对');
  await page
    .getByRole('button', { name: '全选可同步草稿', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: '批量同步（1）', exact: true }),
  ).toBeEnabled();
});
test('演示模式不发出批量请求', async ({ page }) => {
  const r = await mock(page);
  await page.goto('/sync/batch?demo=1&draft=batch-1');
  await expect(
    page.getByText('演示模式不会发送真实作业。', { exact: true }),
  ).toBeVisible();
  expect(r.previews).toBe(0);
  expect(r.confirms).toBe(0);
});
test('同步状态读取失败时禁用批量选择，恢复后可键盘选择且最多20条', async ({
  page,
}) => {
  await mock(page);
  const many = Array.from({ length: 22 }, (_, i) => ({
    ...drafts[0],
    id: `many-${i}`,
    content: `合成候选练习 ${i}`,
  }));
  many.push({
    ...drafts[0],
    id: 'other-child',
    childId: 'different-child',
    content: '其他孩子合成作业',
  });
  await page.route('**/api/v1/drafts', (r) =>
    r.fulfill({ json: { items: many } }),
  );
  let failed = true;
  await page.route('**/api/v1/sync/records', (r) =>
    r.fulfill(failed ? { status: 503, json: {} } : { json: { items: [] } }),
  );
  await page.goto('/drafts?child=batch-child');
  await expect(
    page.getByText('同步状态读取失败，暂时不能同步，请重新加载。'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '全选可同步草稿', exact: true }),
  ).toBeDisabled();
  failed = false;
  await page.getByRole('button', { name: '重新读取同步状态' }).click();
  const selection = page.getByRole('button', { name: '选择草稿', exact: true });
  await expect(selection).toHaveCount(22);
  await selection.first().focus();
  await page.keyboard.press('Space');
  await expect(selection.first()).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '取消全选' }).click();
  await page
    .getByRole('button', { name: '全选可同步草稿', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: '批量同步（20）', exact: true }),
  ).toBeEnabled();
  await expect(selection.nth(20)).toBeDisabled();
  await expect(page.getByText('其他孩子合成作业', { exact: true })).toHaveCount(
    0,
  );
});
