import { expect, it } from 'vitest';
import { inspectPublicFile } from './public-policy.mjs';
it('阻止私有目录和真实数据文件', () => {
  for (const file of [
    'work/research.md',
    'outputs/report.md',
    '.env.local',
    'data/tasks.sqlite',
    'base.apk',
    'photo.jpg',
  ])
    expect(inspectPublicFile(file, '')).not.toEqual([]);
});
it('阻止账号、会话和本机身份信息且不返回原值', () => {
  const samples = [
    '1' + '3812345678',
    'family_id=' + '1' + '0'.repeat(17) + '1',
    '/Users/' + 'example/secret',
    'Bearer ' + 'a'.repeat(40),
    '-----BEGIN ' + 'PRIVATE KEY-----',
  ];
  for (const sample of samples) {
    const findings = inspectPublicFile('example.ts', sample);
    expect(findings.length).toBeGreaterThan(0);
    expect(JSON.stringify(findings)).not.toContain(sample);
  }
});
it('允许合成示例和配置说明', () => {
  expect(inspectPublicFile('.env.example', 'PORT=3000')).toEqual([]);
  expect(
    inspectPublicFile(
      'fixture.json',
      '{"childId":"child-example","content":"合成数据"}',
    ),
  ).toEqual([]);
});
