import { it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import https from 'node:https';
import { createHash } from 'node:crypto';
import { buildApp } from './app';
it('TLS 上认证读写草稿，重开数据库保留内容且未认证禁止访问', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nas-https-'));
  const key = join(dir, 'server.key'),
    cert = join(dir, 'server.crt');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      key,
      '-out',
      cert,
      '-days',
      '1',
      '-subj',
      '/CN=Synthetic test',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
    ],
    { stdio: 'pipe' },
  );
  const password = 'synthetic-generated-password';
  const origin = 'https://192.168.50.9:19473';
  const options = {
    nas: {
      origin,
      cidr: '192.168.50.0/24',
      passwordHash: createHash('sha256').update(password).digest('hex'),
    },
    tls: { key: readFileSync(key), cert: readFileSync(cert) },
    databasePath: join(dir, 'drafts.sqlite'),
  };
  let app = await buildApp(options);
  async function request(
    path: string,
    method = 'GET',
    payload?: unknown,
    auth = true,
  ) {
    const port = (app.server.address() as { port: number }).port;
    return await new Promise<{ status: number; body: string }>(
      (resolve, reject) => {
        const req = https.request(
          {
            hostname: '127.0.0.1',
            port,
            path,
            method,
            ca: readFileSync(cert),
            headers: {
              host: new URL(origin).host,
              origin,
              'content-type': 'application/json',
              'x-local-request': '1',
              ...(auth
                ? {
                    authorization:
                      'Basic ' +
                      Buffer.from('admin:' + password).toString('base64'),
                  }
                : {}),
            },
          },
          (res) => {
            let body = '';
            res.on('data', (c) => (body += c));
            res.on('end', () => resolve({ status: res.statusCode!, body }));
          },
        );
        req.on('error', reject);
        req.end(payload ? JSON.stringify(payload) : undefined);
      },
    );
  }
  try {
    await app.listen({ host: '127.0.0.1', port: 0 });
    const draft = {
      id: 'synthetic-nas-draft',
      childId: 'synthetic-child',
      date: '2026-01-02',
      subject: 'math',
      content: '合成练习',
      targetMinutes: 15,
      submissionRequirement: 'image',
    };
    expect((await request('/api/v1/drafts', 'POST', draft)).status).toBe(201);
    expect(
      (await request('/api/v1/drafts', 'GET', undefined, false)).status,
    ).toBe(401);
    await app.close();
    app = await buildApp(options);
    await app.listen({ host: '127.0.0.1', port: 0 });
    expect(JSON.parse((await request('/api/v1/drafts')).body).items).toEqual([
      draft,
    ]);
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
