import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
} from 'node:fs';
import { isAbsolute } from 'node:path';
/** NAS 密钥只来自独立挂载，不从环境变量读取密钥值。 */
export function loadFileKey(path: string): Buffer {
  let fd: number | undefined;
  try {
    if (!isAbsolute(path)) throw Error();
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (
      !stat.isFile() ||
      stat.size !== 32 ||
      stat.mode & 0o077 ||
      (stat.uid !== 0 && stat.uid !== process.getuid?.())
    )
      throw Error();
    return readFileSync(fd);
  } catch {
    throw new Error('NAS 密钥文件缺失或权限不安全');
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
