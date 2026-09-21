import { useCallback, useEffect, useState } from 'react';

/** A hash router, so the app works on any static host and inside a
 *  home-screen web app without server rewrites. */

export function currentPath(): string {
  const h = window.location.hash.replace(/^#/, '');
  return h || '/';
}

export function navigate(path: string, replace = false): void {
  const target = '#' + (path.startsWith('/') ? path : '/' + path);
  if (replace) window.location.replace(target);
  else window.location.hash = target;
}

export function useRoute(): { path: string; parts: string[]; query: URLSearchParams } {
  const [path, setPath] = useState(currentPath);

  useEffect(() => {
    const onChange = () => {
      setPath(currentPath());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const [clean, qs] = path.split('?');
  return {
    path: clean,
    parts: clean.split('/').filter(Boolean),
    query: new URLSearchParams(qs ?? ''),
  };
}

export function useBack(): () => void {
  return useCallback(() => {
    if (window.history.length > 1) window.history.back();
    else navigate('/');
  }, []);
}
