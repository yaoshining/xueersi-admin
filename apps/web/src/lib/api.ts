import { z } from 'zod';
export async function getJson<T>(
  path: string,
  schema: z.ZodType<T>,
  timeoutMs = 8000,
): Promise<T> {
  const response = await fetch(path, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error('本机服务请求失败');
  return schema.parse(await response.json());
}

export async function mutateJson<T>(
  path: string,
  method: 'POST' | 'PUT' | 'DELETE',
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      'X-Local-Request': '1',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok)
    throw new Error(
      response.status === 409
        ? '草稿冲突，已有内容未被覆盖'
        : response.status === 404
          ? '草稿已不存在，请返回列表刷新'
          : '无法保存草稿，请检查本机服务后重试',
    );
  return schema.parse(await response.json());
}
