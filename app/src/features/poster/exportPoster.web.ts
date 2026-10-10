import type Svg from 'react-native-svg';

/** In the browser: draw the on-screen SVG onto a full-size canvas and download it as a PNG. */
export async function exportPoster(_svg: Svg | null, size: { w: number; h: number }, name: string) {
  const el = document.getElementById('poster-canvas')?.querySelector('svg');
  if (!el) throw new Error('no poster');
  const copy = el.cloneNode(true) as SVGSVGElement;
  copy.setAttribute('width', String(size.w));
  copy.setAttribute('height', String(size.h));
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' }),
  );
  try {
    const img = new Image();
    await new Promise((ok, fail) => {
      img.onload = ok;
      img.onerror = fail;
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = size.w;
    canvas.height = size.h;
    canvas.getContext('2d')!.drawImage(img, 0, 0, size.w, size.h);
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${name}.png`;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
