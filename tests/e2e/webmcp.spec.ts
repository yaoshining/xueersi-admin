import { test, expect, type Page } from '@playwright/test';
import type { AgentController } from '../../apps/web/src/features/agent/controller';
type Tool = AgentController['tools'][number];
declare global {
  interface Window {
    testAgentTools: Map<string, Tool>;
  }
}
async function call(page: Page, name: string, input: unknown = {}) {
  return page.evaluate(
    async ({ name, input }) => {
      const result = await window.testAgentTools.get(name)!.execute(input);
      return JSON.parse(result.content.find((x) => x.type === 'text')!.text);
    },
    { name, input },
  );
}
async function setup(page: Page) {
  await page.addInitScript(() => {
    const tools = new Map<string, Tool>();
    window.testAgentTools = tools;
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        registerTool(tool: Tool, options?: { signal: AbortSignal }) {
          if (tools.has(tool.name)) throw Error('duplicate');
          tools.set(tool.name, tool);
          options?.signal.addEventListener('abort', () => {
            if (tools.get(tool.name) === tool) tools.delete(tool.name);
          });
        },
      },
    });
  });
  await page.route('**/api/v1/connection', (r) =>
    r.fulfill({
      json: {
        status: 'connected',
        canRead: true,
        canWrite: true,
        sessionId: 'synthetic-session',
        child: { value: 'synthetic-child', label: '合成孩子' },
        device: { value: 'synthetic-device', label: '合成学习机' },
      },
    }),
  );
  await page.route('**/api/v1/homework?*', (r) =>
    r.fulfill({
      json: {
        mode: 'real',
        items: [
          {
            id: 'synthetic-task',
            date: '2026-10-17',
            subject: 'math',
            content: '合成练习',
            status: 'pending',
            targetMinutes: 15,
            submissionRequirement: 'image',
          },
        ],
      },
    }),
  );
}
for (const theme of ['light', 'dark'])
  test(`会话查询、草稿与本人确认闭环 · ${theme}`, async ({ page }) => {
    await setup(page);
    await page.addInitScript(
      (theme) => localStorage.setItem('xueban.theme.v1', theme),
      theme,
    );
    const draft = {
      id: 'agent-synthetic-request',
      childId: 'synthetic-child',
      date: '2026-10-17',
      subject: 'math',
      content: '合成练习',
      targetMinutes: 15,
      submissionRequirement: 'image',
    };
    let saved = { ...draft },
      version = 'a'.repeat(64),
      writes = 0;
    await page.route('**/api/v1/agent/drafts', (r) => {
      if (r.request().method() === 'GET')
        return r.fulfill({ json: { items: [{ draft: saved, version }] } });
      const body = r.request().postDataJSON();
      if (body.expectedVersion && body.expectedVersion !== version)
        return r.fulfill({
          status: 409,
          json: { error: { code: 'DRAFT_CONFLICT' } },
        });
      saved = body.draft;
      version = body.expectedVersion ? 'b'.repeat(64) : version;
      return r.fulfill({ json: { draft: saved, version } });
    });
    const summary = () => ({
      draft: saved,
      child: '合成孩子',
      device: '合成学习机',
      typeLabel: '数学 · 其他',
    });
    await page.route('**/api/v1/sync/preview', (r) =>
      r.fulfill({
        json: {
          ticketId: 'synthetic-ticket',
          secret: 'synthetic-secret',
          expiresAt: Date.now() + 300000,
          summary: summary(),
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
          id: 'synthetic-job',
          createdAt: Date.now(),
          status: 'accepted',
          summary: summary(),
        },
      });
    });
    await page.goto('/assistant');
    await expect(page.getByText('会话工具已就绪')).toBeVisible();
    expect(
      await page.evaluate(() => [...window.testAgentTools.keys()]),
    ).toHaveLength(11);
    const contextRef = (await call(page, 'get_task_context')).data.contextRef;
    const list = await call(page, 'list_homework', {
      contextRef,
      date: '2026-10-17',
    });
    expect(list.data.items[0].content).toBe('合成练习');
    expect(JSON.stringify(list)).not.toContain('synthetic-task');
    const fields = {
      date: draft.date,
      subject: draft.subject,
      content: draft.content,
      targetMinutes: 15,
      submissionRequirement: 'image',
    };
    const created = await call(page, 'create_draft', {
      contextRef,
      requestId: 'synthetic-request',
      ...fields,
    });
    expect(created.data.savedLocally).toBe(true);
    const updated = await call(page, 'update_draft', {
      contextRef,
      draftId: created.data.draft.id,
      expectedVersion: created.data.draft.version,
      ...fields,
      content: '合成练习已修改',
    });
    expect(updated.data.draft.content).toBe('合成练习已修改');
    const conflict = await call(page, 'update_draft', {
      contextRef,
      draftId: created.data.draft.id,
      expectedVersion: created.data.draft.version,
      ...fields,
    });
    expect(conflict).toMatchObject({
      ok: false,
      error: 'DRAFT_OR_PREVIEW_CONFLICT',
    });
    let preview = await call(page, 'preview_task_action', {
      contextRef,
      kind: 'sync',
      draftId: saved.id,
    });
    expect(JSON.stringify(preview)).not.toContain('synthetic-secret');
    expect(writes).toBe(0);
    await expect(page.getByText('15 分钟', { exact: true })).toBeVisible();
    await expect(page.getByText('图片', { exact: true })).toBeVisible();
    await expect(
      page.getByText('合成练习已修改', { exact: true }),
    ).toBeVisible();
    expect(
      (
        await call(page, 'preview_task_action', {
          contextRef,
          kind: 'sync',
          draftId: saved.id,
        })
      ).error,
    ).toBe('PREVIEW_ALREADY_OPEN');
    expect(
      (
        await call(page, 'cancel_task_action', {
          contextRef,
          actionRef: preview.data.actionRef,
        })
      ).data.status,
    ).toBe('cancelled');
    await expect(
      page.getByRole('button', { name: '确认提交这条作业' }),
    ).toHaveCount(0);
    expect(writes).toBe(0);
    preview = await call(page, 'preview_task_action', {
      contextRef,
      kind: 'sync',
      draftId: saved.id,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `outputs/webmcp-${theme}-${test.info().project.name}.png`,
      fullPage: true,
    });
    // 仅模拟运输，不访问官方写入端点。
    await page.getByRole('button', { name: '确认提交这条作业' }).click();
    await expect(
      page.getByText('官方已接受，请核对学习机或刷新列表'),
    ).toBeVisible();
    expect(writes).toBe(1);
    expect(
      (
        await call(page, 'get_action_status', {
          contextRef,
          actionRef: preview.data.actionRef,
        })
      ).data.status,
    ).toBe('accepted');
  });
test('删除预览只由网页确认，未知结果不能再次确认', async ({ page }) => {
  await setup(page);
  let writes = 0;
  await page.route('**/api/v1/homework/delete/preview', (r) =>
    r.fulfill({
      json: {
        ticketId: 'synthetic-delete',
        secret: 'synthetic-secret',
        expiresAt: Date.now() + 300000,
        summary: {
          child: '合成孩子',
          device: '合成学习机',
          item: {
            id: 'synthetic-task',
            date: '2026-10-17',
            subject: 'math',
            content: '合成练习',
            status: 'pending',
          },
        },
      },
    }),
  );
  await page.route('**/api/v1/homework/delete/confirm', (r) => {
    writes++;
    return r.fulfill({ json: { status: 'unknown' } });
  });
  await page.goto('/assistant');
  await expect(page.getByText('会话工具已就绪')).toBeVisible();
  const contextRef = (await call(page, 'get_task_context')).data.contextRef;
  const taskRef = (
    await call(page, 'list_homework', { contextRef, date: '2026-10-17' })
  ).data.items[0].taskRef;
  await call(page, 'preview_task_action', {
    contextRef,
    kind: 'delete',
    taskRef,
  });
  expect(writes).toBe(0);
  await page.getByRole('button', { name: '确认永久删除' }).click();
  await expect(
    page.getByText('结果不确定，请核对官方记录，不要重复提交'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '确认永久删除' })).toHaveCount(
    0,
  );
  expect(writes).toBe(1);
});
test('不支持 WebMCP 时普通网页继续可用', async ({ page }) => {
  await page.goto('/assistant');
  await expect(
    page.getByText('当前浏览器不支持会话工具，可继续使用普通网页。'),
  ).toBeVisible();
  await page.goto('/calendar?demo=1');
  await expect(page.getByRole('heading', { name: '任务总览' })).toBeVisible();
});

test('会话直接读取图片和音频，无需打开详情页', async ({ page }) => {
  await setup(page);
  await page.route('**/api/v1/homework?*', (r) =>
    r.fulfill({
      json: {
        mode: 'real',
        items: [
          {
            id: 'synthetic-task',
            date: '2026-10-17',
            subject: 'math',
            content: '合成练习',
            status: 'completed',
          },
        ],
      },
    }),
  );
  await page.route('**/api/v1/homework/report?*', (r) =>
    r.fulfill({
      json: {
        attachments: [
          {
            kind: 'image',
            state: 'available',
            url: 'https://media.example.invalid/image.png',
          },
          {
            kind: 'audio',
            state: 'available',
            url: 'https://media.example.invalid/voice.wav',
          },
        ],
      },
    }),
  );
  let mediaReads = 0;
  await page.route('**/api/v1/homework/attachment', (r) => {
    mediaReads++;
    const q = r.request().postDataJSON();
    expect(q).not.toHaveProperty('url');
    expect(q.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    const audio = q.index === 1;
    return r.fulfill({
      json: {
        kind: audio ? 'audio' : 'image',
        mimeType: audio ? 'audio/wav' : 'image/png',
        byteLength: 3,
        data: 'YWJj',
      },
    });
  });
  await page.goto('/assistant');
  await expect(page.getByText('会话工具已就绪')).toBeVisible();
  const contextRef = (await call(page, 'get_task_context')).data.contextRef;
  const taskRef = (
    await call(page, 'list_homework', { contextRef, date: '2026-10-17' })
  ).data.items[0].taskRef;
  const detail = await call(page, 'get_homework', { contextRef, taskRef });
  for (const attachment of detail.data.attachments) {
    const result = await page.evaluate(
      async ({ contextRef, attachmentRef }) =>
        window.testAgentTools
          .get('read_homework_attachment')!
          .execute({ contextRef, attachmentRef }),
      { contextRef, attachmentRef: attachment.attachmentRef },
    );
    expect(result.content).toContainEqual({
      type: attachment.kind,
      mimeType: attachment.kind === 'image' ? 'image/png' : 'audio/wav',
      data: 'YWJj',
    });
    expect(JSON.stringify(result)).not.toContain('https:');
    expect(page.url()).toContain('/assistant');
  }
  expect(mediaReads).toBe(2);
  await page.reload();
  await expect(page.getByText('会话工具已就绪')).toBeVisible();
  expect(
    (
      await call(page, 'read_homework_attachment', {
        contextRef,
        attachmentRef: detail.data.attachments[0].attachmentRef,
      })
    ).ok,
  ).toBe(false);
  expect(mediaReads).toBe(2);
});
