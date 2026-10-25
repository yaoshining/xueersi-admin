import type { AgentController } from './controller';
type Tool = AgentController['tools'][number];
export type ModelContext = {
  registerTool: (
    tool: Tool,
    options?: { signal: AbortSignal },
  ) => void | Promise<void>;
  unregisterTool?: (name: string) => void;
};
export function registerAgentTools(
  doc: { modelContext?: ModelContext },
  nav: { modelContext?: ModelContext },
  tools: Tool[],
) {
  const api = doc.modelContext ?? nav.modelContext;
  const abort = new AbortController();
  let disposed = false;
  const names: string[] = [];
  function dispose() {
    disposed = true;
    abort.abort();
    for (const name of names) {
      try {
        api?.unregisterTool?.(name);
      } catch {
        /* 宿主已撤销。 */
      }
    }
    names.length = 0;
  }
  const ready = (async () => {
    if (!api?.registerTool) return 'unsupported' as const;
    try {
      for (const tool of tools) {
        if (disposed) return 'stopped' as const;
        const pending = api.registerTool(
          {
            ...tool,
            execute: (input, execution) =>
              tool.execute(input, {
                signal: execution?.signal
                  ? AbortSignal.any([execution.signal, abort.signal])
                  : abort.signal,
              }),
          },
          { signal: abort.signal },
        );
        if (pending) await pending;
        names.push(tool.name);
        if (disposed) {
          dispose();
          return 'stopped' as const;
        }
      }
      return 'ready' as const;
    } catch {
      dispose();
      return 'failed' as const;
    }
  })();
  return { ready, dispose };
}
