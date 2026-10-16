import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildApp } from './app';
afterEach(() => vi.unstubAllGlobals());
describe('初始化API', () => {
  it('健康检查包含服务状态', async () => {
    const app = await buildApp();
    try {
      const r = await app.inject('/api/v1/health');
      expect(r.statusCode).toBe(200);
      expect(r.json()).toMatchObject({
        status: 'ok',
        service: 'xueersi-admin',
      });
    } finally {
      await app.close();
    }
  });
  it('连接状态只返回公开字段', async () => {
    const app = await buildApp();
    try {
      const r = await app.inject('/api/v1/connection');
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual({
        status: 'disconnected',
        canRead: false,
        canWrite: false,
      });
    } finally {
      await app.close();
    }
  });
  it('缺少会话时不伪装成功、不访问外网', async () => {
    const network = vi.fn();
    vi.stubGlobal('fetch', network);
    const app = await buildApp();
    try {
      const r = await app.inject('/api/v1/homework');
      expect(r.statusCode).toBe(503);
      expect(r.json()).toMatchObject({
        error: { code: 'CONNECTION_REQUIRED' },
      });
      expect(network).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it('独立演示接口显式标识合成数据', async () => {
    const app = await buildApp();
    try {
      const r = await app.inject('/api/v1/demo/homework');
      expect(r.statusCode).toBe(200);
      expect(r.json().mode).toBe('demo');
      expect(r.json().items).toHaveLength(3);
    } finally {
      await app.close();
    }
  });
  it('不存在的API保持404', async () => {
    const app = await buildApp();
    try {
      expect((await app.inject('/api/v1/unknown')).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
