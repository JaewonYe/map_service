export type ThemeChoice = 'light' | 'dark' | 'system';
export function normalizeTheme(value: unknown): ThemeChoice {
  return value === 'light' || value === 'dark' ? value : 'system';
}
// Runs before paint. Browser storage is optional; system CSS remains a complete fallback.
export const themeBootstrap = `(function(){var t='system';try{var v=localStorage.getItem('platform.theme');if(v==='light'||v==='dark')t=v;}catch(e){}if(t==='system')document.documentElement.removeAttribute('data-theme');else document.documentElement.setAttribute('data-theme',t);})();`;
