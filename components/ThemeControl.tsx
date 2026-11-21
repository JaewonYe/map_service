'use client';
import {useEffect, useState} from 'react';
import {normalizeTheme, type ThemeChoice} from '../lib/theme';

function applyTheme(value: ThemeChoice) {
  if (value === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = value;
  window.dispatchEvent(new CustomEvent('platform-themechange',{detail:value}));
}
export default function ThemeControl({label = '화면 테마'}: {label?: string}) {
  // Match the server markup; the bootstrap has already applied the saved CSS theme.
  const [choice, setChoice] = useState<ThemeChoice>('system');
  useEffect(() => {
    const saved = normalizeTheme(document.documentElement.dataset.theme);
    applyTheme(saved); setChoice(saved);
    const sync = (event: StorageEvent) => {
      if (event.key !== null && event.key !== 'platform.theme') return;
      const next = normalizeTheme(event.newValue); applyTheme(next); setChoice(next); updateChrome();
    };
    const media = matchMedia('(prefers-color-scheme: dark)');
    const updateChrome = () => {
      const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--color-header').trim();
    };
    const localSync=(event:Event)=>setChoice(normalizeTheme((event as CustomEvent).detail));
    window.addEventListener('platform-themechange',localSync);
    updateChrome(); media.addEventListener('change', updateChrome);
    window.addEventListener('storage', sync);
    return () => {window.removeEventListener('platform-themechange',localSync);window.removeEventListener('storage', sync); media.removeEventListener('change', updateChrome);};
  }, []);
  function change(next: ThemeChoice) {
    applyTheme(next); setChoice(next);
    try {localStorage.setItem('platform.theme', next);} catch {}
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--color-header').trim();
  }
  return <label className="theme-control"><span>화면 테마</span>
    <select name="theme" aria-label={label} value={choice} onChange={e => change(normalizeTheme(e.target.value))}>
      <option value="system">시스템</option><option value="light">라이트</option><option value="dark">다크</option>
    </select>
  </label>;
}
