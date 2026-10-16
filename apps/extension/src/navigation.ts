export const MANAGEMENT_URL = 'http://127.0.0.1:3000/';
export function isManagementUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === 'http://127.0.0.1:3000' && !url.username && !url.password
    );
  } catch {
    return false;
  }
}
