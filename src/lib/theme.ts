import { prefs } from './local';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type TextSize = 'normal' | 'large' | 'larger';

/** Appearance lives on <html> so CSS can key off it in one place. */
export function applyAppearance(): void {
  const theme = prefs.get<ThemeChoice>('theme', 'system');
  const text = prefs.get<TextSize>('textSize', 'normal');
  const reduceMotion = prefs.get<boolean>('reduceMotion', false);
  const root = document.documentElement;

  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);

  if (text === 'normal') root.removeAttribute('data-text');
  else root.setAttribute('data-text', text);

  if (reduceMotion) root.setAttribute('data-motion', 'reduced');
  else root.removeAttribute('data-motion');
}

export function setTheme(theme: ThemeChoice): void {
  prefs.set('theme', theme);
  applyAppearance();
}

export function setTextSize(size: TextSize): void {
  prefs.set('textSize', size);
  applyAppearance();
}

export function setReduceMotion(on: boolean): void {
  prefs.set('reduceMotion', on);
  applyAppearance();
}
