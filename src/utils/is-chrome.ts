export const isChrome = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Chrome/.test(ua) && !/Edg|OPR|Brave|Firefox/.test(ua);
};
