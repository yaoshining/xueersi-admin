import { z } from 'zod';
export async function getJson<T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(path, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('本机服务请求失败');
  return schema.parse(await response.json());
}
