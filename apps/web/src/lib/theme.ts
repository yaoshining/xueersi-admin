export type ThemePreference = 'light' | 'dark' | 'system';
export const THEME_KEY = 'xueban.theme.v1';
export function parseTheme(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}
export function resolvedTheme(
  preference: ThemePreference,
  systemDark: boolean,
) {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}
export function readTheme(): ThemePreference {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return 'system';
  }
}
export function applyTheme(preference: ThemePreference) {
  const resolved = resolvedTheme(
    preference,
    matchMedia('(prefers-color-scheme: dark)').matches,
  );
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.style.colorScheme = resolved;
}
