import { execFileSync } from 'node:child_process';
import { inspectPublicFile } from './public-policy.mjs';
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
if (!files.length)
  throw new Error('请先暂存公开文件；不能用空文件集通过检查。');
let count = 0;
for (const file of files) {
  // 检查索引中的实际待提交内容，避免工作区已脱敏但暂存区仍有旧值。
  const content = execFileSync('git', ['show', `:${file}`], {
    maxBuffer: 10 * 1024 * 1024,
  }).toString('utf8');
  for (const rule of inspectPublicFile(file, content)) {
    console.error(`${file}：${rule}`);
    count++;
  }
}
for (const path of [
  'work/probe.txt',
  'outputs/probe.txt',
  'data/probe.sqlite',
  '.env.local',
  'sample.apk',
  'sample.cer',
  'session.enc',
]) {
  try {
    execFileSync('git', ['check-ignore', '--no-index', '-q', path]);
  } catch {
    console.error(`未排除私有资料路径类型：${path.split('/')[0]}`);
    count++;
  }
}
if (count) {
  console.error(`公开检查失败：${count} 项，请人工处理。`);
  process.exitCode = 1;
} else
  console.info(
    `公开检查通过：${files.length} 个受版本控制文件。仍需人工确认样例全部为合成数据。`,
  );
