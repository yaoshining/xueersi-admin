import { browser } from 'wxt/browser';
import { MANAGEMENT_URL, isManagementUrl } from '../../src/navigation';
import './style.css';
document
  .querySelector<HTMLButtonElement>('#open')!
  .addEventListener('click', async () => {
    const status = document.querySelector<HTMLElement>('[role="status"]')!;
    try {
      if (!isManagementUrl(MANAGEMENT_URL)) throw new Error('无效地址');
      await browser.tabs.create({ url: MANAGEMENT_URL });
      status.textContent = '管理端已打开；请确保本机服务已启动。';
    } catch {
      status.textContent = '打开失败，请手动访问本机管理端。';
    }
  });
