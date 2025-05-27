export const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0, g = 0, b = 0;

  if (h >= 0 && h < 60) {
    [r, g, b] = [c, x, 0];
  } else if (h >= 60 && h < 120) {
    [r, g, b] = [x, c, 0];
  } else if (h >= 120 && h < 180) {
    [r, g, b] = [0, c, x];
  } else if (h >= 180 && h < 240) {
    [r, g, b] = [0, x, c];
  } else if (h >= 240 && h < 300) {
    [r, g, b] = [x, 0, c];
  } else {
    [r, g, b] = [c, 0, x];
  }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255)
  ];
};


export const hslToHex = (h: number, s: number, l: number): string => {
  const [r, g, b] = hslToRgb(h, s, l);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}


export const herouiColor = (color: string, colorType: 'hsl' | 'rgb' | 'hex' = 'hsl') => {
  const rootStyle = getComputedStyle(document.documentElement); 
  const hsl = rootStyle.getPropertyValue(`--heroui-${color}`).trim().split(' ').map(val => {
    return parseFloat(val.replace('%', ''));
  })
  switch (colorType) {
    case 'hsl':
      return hsl;
    case 'rgb':
      return hslToRgb(hsl[0], hsl[1], hsl[2]);
    case 'hex':
      return hslToHex(hsl[0], hsl[1], hsl[2]);
    default:
      return hsl;
  }
} 


export const herouiColorOpacity = (color: string, opacity: number, colorType: 'hsl' | 'rgb' | 'hex' = 'hsl') => {
  const rootStyle = getComputedStyle(document.documentElement); 
  const hsl = rootStyle.getPropertyValue(`--heroui-${color}`).trim().split(' ').map(val => {
    return parseFloat(val.replace('%', ''));
  })
  
  switch (colorType) {
    case 'hsl':
      return [hsl[0], hsl[1], hsl[2], opacity];
    case 'rgb':
      const [r, g, b] = hslToRgb(hsl[0], hsl[1], hsl[2]);
      return [r, g, b, opacity];
    case 'hex':
      const hexColor = hslToHex(hsl[0], hsl[1], hsl[2]);
      return hexColor + Math.round(opacity * 255).toString(16).padStart(2, '0');
    default:
      return [hsl[0], hsl[1], hsl[2], opacity];
  }
}