import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { AgentController, ToolError } from './controller';
import { registerAgentTools, type ModelContext } from './register';
export function useAgentTools() {
  const location = useLocation(),
    navigate = useNavigate(),
    client = useQueryClient();
  const demo = new URLSearchParams(location.search).get('demo') === '1';
  const latest = useRef({ demo, navigate, client });
  useEffect(() => {
    latest.current = { demo, navigate, client };
  }, [demo, navigate, client]);
  const [, update] = useState(0);
  const [status, setStatus] = useState('checking');
  const [controller] = useState(
    () =>
      new AgentController({
        isDemo: () => latest.current.demo,
        onChange: () => update((x) => x + 1),
        invalidate: () => {
          for (const key of [
            'drafts',
            'draft',
            'real-homework',
            'sync-records',
          ])
            void latest.current.client.invalidateQueries({ queryKey: [key] });
        },
        showReview: () => {
          if (document.fullscreenElement)
            void document.exitFullscreen().catch(() => {});
          latest.current.navigate('/assistant');
        },
        request: async (path, method, body, signal) => {
          const r = await fetch(path, {
            method: method ?? 'GET',
            headers: method
              ? { 'Content-Type': 'application/json', 'X-Local-Request': '1' }
              : undefined,
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: signal
              ? AbortSignal.any([signal, AbortSignal.timeout(90000)])
              : AbortSignal.timeout(90000),
          });
          if (!r.ok && path === '/api/v1/homework/attachment') {
            const body: unknown = await r.json().catch(() => null);
            const code =
              body &&
              typeof body === 'object' &&
              'error' in body &&
              body.error &&
              typeof body.error === 'object' &&
              'code' in body.error
                ? body.error.code
                : null;
            const allowed = [
              'MEDIA_BUSY',
              'MEDIA_TOO_LARGE',
              'MEDIA_UNAVAILABLE',
              'MEDIA_CHANGED',
              'MEDIA_CONTEXT_CHANGED',
              'MEDIA_CANCELLED',
              'MEDIA_TARGET_DENIED',
              'MEDIA_UNSUPPORTED',
            ];
            throw new ToolError(
              typeof code === 'string' && allowed.includes(code)
                ? code
                : 'MEDIA_UNAVAILABLE',
            );
          }
          if (!r.ok)
            throw new ToolError(
              r.status === 409
                ? 'DRAFT_OR_PREVIEW_CONFLICT'
                : r.status === 403
                  ? 'TARGET_OR_REQUEST_REJECTED'
                  : 'LOCAL_REQUEST_FAILED',
            );
          return r.json();
        },
      }),
  );
  useEffect(() => {
    let active = true;
    const handle = registerAgentTools(
      document as Document & { modelContext?: ModelContext },
      navigator as Navigator & { modelContext?: ModelContext },
      controller.tools,
    );
    void handle.ready.then((value) => {
      if (active) setStatus(value);
    });
    return () => {
      active = false;
      handle.dispose();
    };
  }, [controller]);
  return { controller, status };
}
