let cachedLogoPromise: Promise<string | null> | null = null;

export function getLogoPath(): string {
  const base =
    typeof import.meta !== 'undefined' && import.meta.env && typeof import.meta.env.BASE_URL === 'string'
      ? import.meta.env.BASE_URL
      : '/';
  const normalized = base.endsWith('/') ? base : `${base}/`;
  return `${normalized}logo-pii.png`;
}

export function loadLogoDataUrl(): Promise<string | null> {
  if (typeof window === 'undefined' || typeof fetch !== 'function') {
    return Promise.resolve(null);
  }
  if (cachedLogoPromise) return cachedLogoPromise;

  cachedLogoPromise = (async () => {
    try {
      const response = await fetch(getLogoPath());
      if (!response.ok) return null;
      const blob = await response.blob();
      return await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  })();

  return cachedLogoPromise;
}
