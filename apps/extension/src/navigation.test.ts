import { it, expect } from 'vitest';
import { isManagementUrl } from './navigation';
it('仅允许固定本机管理端', () => {
  expect(isManagementUrl('http://127.0.0.1:3000/')).toBe(true);
  for (const url of [
    'https://example.com',
    'http://127.0.0.1.evil.test:3000',
    'javascript:alert(1)',
    'http://127.0.0.1:3000@evil.test/',
    'http://127.0.0.1:3001/',
  ])
    expect(isManagementUrl(url)).toBe(false);
});
