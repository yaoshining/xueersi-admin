import { it, expect, vi } from 'vitest';
import { AgentController } from './controller';
import { z } from 'zod';
const connection = {
  status: 'connected',
  canRead: true,
  canWrite: false,
  sessionId: 'synthetic-session',
  child: { value: 'synthetic-child', label: '合成孩子' },
  device: { value: 'synthetic-device', label: '合成设备' },
};
const item = {
  id: 'synthetic-task',
  date: '2026-10-19',
  subject: 'math',
  content: '合成练习',
  status: 'completed',
};
const ref = z.object({ data: z.object({ contextRef: z.string() }) });
const task = z.object({
  data: z.object({ items: z.array(z.object({ taskRef: z.string() })) }),
});
const report = z.object({
  data: z.object({
    attachments: z.array(z.object({ attachmentRef: z.string().optional() })),
  }),
});
function fixture() {
  let time = 0,
    current = { ...connection },
    demo = false;
  const request = vi.fn(async (path: string) => {
    if (path === '/api/v1/connection') return current;
    if (path.startsWith('/api/v1/homework?'))
      return { mode: 'real', items: [item] };
    if (path.startsWith('/api/v1/homework/report?'))
      return {
        attachments: [
          {
            kind: 'image',
            state: 'available',
            url: 'https://media.example.invalid/image.png?signature=synthetic',
          },
          {
            kind: 'audio',
            state: 'available',
            url: 'https://media.example.invalid/audio.wav?signature=synthetic',
          },
          { kind: 'image', state: 'expired' },
        ],
      };
    if (path === '/api/v1/homework/attachment')
      return {
        kind: 'image',
        mimeType: 'image/png',
        byteLength: 3,
        data: 'YWJj',
      };
    throw Error('synthetic-private-error');
  });
  const c = new AgentController({
    request,
    isDemo: () => demo,
    now: () => time,
    onChange() {},
    invalidate() {},
    showReview() {},
  });
  return {
    c,
    request,
    expire: () => {
      time = 300001;
    },
    change: () => {
      current = { ...connection, sessionId: 'changed' };
    },
    demo: () => {
      demo = true;
    },
  };
}
async function setup(f: ReturnType<typeof fixture>) {
  const contextRef = ref.parse(await f.c.execute('get_task_context', {})).data
    .contextRef;
  const taskRef = task.parse(
    await f.c.execute('list_homework', { contextRef, date: item.date }),
  ).data.items[0].taskRef;
  const detail = await f.c.execute('get_homework', { contextRef, taskRef });
  const attachments = report.parse(detail).data.attachments;
  return { contextRef, taskRef, attachments, detail };
}
it('图片和音频取得引用，媒体工具返回内容块且不泄漏官方地址与标识', async () => {
  const f = fixture(),
    s = await setup(f);
  expect(s.attachments[0].attachmentRef).toBeTruthy();
  expect(s.attachments[1].attachmentRef).toBeTruthy();
  expect(s.attachments[2].attachmentRef).toBeUndefined();
  expect(JSON.stringify(s.detail)).not.toContain('signature');
  const tool = f.c.tools.find((t) => t.name === 'read_homework_attachment')!;
  expect(tool.annotations.readOnlyHint).toBe(true);
  for (const [index, kind, mimeType] of [
    [0, 'image', 'image/png'],
    [1, 'audio', 'audio/wav'],
  ] as const) {
    const original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (p) =>
      p === '/api/v1/homework/attachment'
        ? { kind, mimeType, byteLength: 3, data: 'YWJj' }
        : original(p),
    );
    const result = await tool.execute({
      contextRef: s.contextRef,
      attachmentRef: s.attachments[index].attachmentRef,
    });
    expect(result.content).toContainEqual({
      type: kind,
      mimeType,
      data: 'YWJj',
    });
    expect(JSON.stringify(result)).not.toContain('synthetic-session');
    expect(JSON.stringify(result)).not.toContain('https:');
  }
  expect(
    f.request.mock.calls.some(([p]) => /confirm|delete|sync/.test(p)),
  ).toBe(false);
});
it('过期、刷新详情、换号、演示、取消、非法引用和 URL 输入不读取媒体', async () => {
  for (const mode of [
    'expired',
    'detail',
    'changed',
    'demo',
    'cancelled',
    'unknown',
    'url',
  ]) {
    const f = fixture(),
      s = await setup(f);
    if (mode === 'expired') f.expire();
    if (mode === 'detail')
      await f.c.execute('get_homework', {
        contextRef: s.contextRef,
        taskRef: s.taskRef,
      });
    if (mode === 'changed') f.change();
    if (mode === 'demo') f.demo();
    const abort = new AbortController();
    if (mode === 'cancelled') abort.abort();
    f.request.mockClear();
    expect(
      await f.c.execute(
        'read_homework_attachment',
        {
          contextRef: s.contextRef,
          attachmentRef:
            mode === 'unknown' ? 'unknown' : s.attachments[0].attachmentRef,
          ...(mode === 'url' ? { url: 'https://example.invalid' } : {}),
        },
        abort.signal,
      ),
    ).toMatchObject({ ok: false });
    expect(
      f.request.mock.calls.some(([p]) => p === '/api/v1/homework/attachment'),
    ).toBe(false);
  }
});
it('媒体请求中上下文改变不返回内容', async () => {
  const f = fixture(),
    s = await setup(f),
    original = f.request.getMockImplementation()!;
  f.request.mockImplementation(async (p) => {
    const result = await original(p);
    if (p === '/api/v1/homework/attachment') f.change();
    return result;
  });
  expect(
    await f.c.execute('read_homework_attachment', {
      contextRef: s.contextRef,
      attachmentRef: s.attachments[0].attachmentRef,
    }),
  ).toMatchObject({ ok: false, error: 'CONTEXT_CHANGED' });
});
