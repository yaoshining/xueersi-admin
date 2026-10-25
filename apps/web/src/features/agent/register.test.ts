import { it, expect, vi } from 'vitest';
import { z } from 'zod';
import { registerAgentTools, type ModelContext } from './register';
const tool = {
  name: 'get_task_context' as const,
  description: '合成工具',
  inputSchema: z.toJSONSchema(z.strictObject({})),
  annotations: { readOnlyHint: true, untrustedContentHint: true },
  execute: vi.fn(async () => ({
    content: [{ type: 'text' as const, text: 'ok' }],
  })),
};
it('能力缺失不报错，新旧接口注销及部分失败均清理', async () => {
  expect(await registerAgentTools({}, {}, [tool]).ready).toBe('unsupported');
  const unregisterTool = vi.fn(),
    registerTool = vi.fn();
  const handle = registerAgentTools(
    {},
    { modelContext: { registerTool, unregisterTool } },
    [tool],
  );
  expect(await handle.ready).toBe('ready');
  handle.dispose();
  expect(unregisterTool).toHaveBeenCalledWith('get_task_context');
  expect(registerTool.mock.calls[0][1].signal.aborted).toBe(true);
  registerTool
    .mockImplementationOnce(() => {})
    .mockImplementationOnce(() => {
      throw Error('synthetic');
    });
  expect(
    await registerAgentTools(
      { modelContext: { registerTool, unregisterTool } },
      {},
      [tool, { ...tool, name: 'list_drafts' }],
    ).ready,
  ).toBe('failed');
});
it('卸载发生在异步注册中时最终仍撤销', async () => {
  let done!: () => void;
  const unregisterTool = vi.fn();
  const h = registerAgentTools(
    {},
    {
      modelContext: {
        unregisterTool,
        registerTool: () =>
          new Promise<void>((r) => {
            done = r;
          }),
      },
    },
    [tool],
  );
  h.dispose();
  done();
  expect(await h.ready).toBe('stopped');
  expect(unregisterTool).toHaveBeenCalledWith('get_task_context');
});
it('同步旧版接口在严格模式卸载重挂时不会误注销新工具', async () => {
  const active = new Map<string, unknown>();
  const api: ModelContext = {
    registerTool: (t) => {
      if (active.has(t.name)) throw Error('duplicate');
      active.set(t.name, t);
    },
    unregisterTool: (name: string) => {
      active.delete(name);
    },
  };
  const first = registerAgentTools({}, { modelContext: api }, [tool]);
  first.dispose();
  const second = registerAgentTools({}, { modelContext: api }, [tool]);
  await first.ready;
  expect(await second.ready).toBe('ready');
  expect(active.has(tool.name)).toBe(true);
  second.dispose();
});
