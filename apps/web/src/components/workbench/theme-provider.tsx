import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  applyTheme,
  parseTheme,
  readTheme,
  resolvedTheme,
  THEME_KEY,
  type ThemePreference,
} from '@/lib/theme';
const ThemeContext = createContext<{
  preference: ThemePreference;
  resolved: 'light' | 'dark';
  setPreference: (value: ThemePreference) => void;
}>({ preference: 'system', resolved: 'light', setPreference: () => {} });
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setValue] = useState(readTheme);
  const [systemDark, setSystemDark] = useState(
    () => matchMedia('(prefers-color-scheme: dark)').matches,
  );
  useEffect(() => {
    applyTheme(preference);
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => {
      applyTheme(preference);
      setSystemDark(media.matches);
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [preference]);
  useEffect(() => {
    const update = (event: StorageEvent) => {
      if (event.key === THEME_KEY || event.key === null) setValue(readTheme());
    };
    window.addEventListener('storage', update);
    return () => window.removeEventListener('storage', update);
  }, []);
  function setPreference(value: ThemePreference) {
    setValue(value);
    applyTheme(value);
    try {
      localStorage.setItem(THEME_KEY, value);
    } catch {
      /* 受限存储不影响当前会话主题。 */
    }
  }
  return (
    <ThemeContext.Provider
      value={{
        preference,
        setPreference,
        resolved: resolvedTheme(preference, systemDark),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
export function useTheme() {
  return useContext(ThemeContext);
}
export function ThemeControl() {
  const { preference, setPreference } = useTheme();
  return (
    <ToggleGroup
      aria-label="外观主题"
      className="theme-control"
      value={[preference]}
      onValueChange={(value) => {
        if (value.length) setPreference(parseTheme(value[0]));
      }}
    >
      {[
        { value: 'light', label: '浅色', icon: Sun },
        { value: 'dark', label: '深色', icon: Moon },
        { value: 'system', label: '跟随系统', icon: Monitor },
      ].map(({ value, label, icon: Icon }) => (
        <ToggleGroupItem key={value} value={value} aria-label={label}>
          <Icon aria-hidden="true" />
          <span>{label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
