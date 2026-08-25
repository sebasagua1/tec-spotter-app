/**
 * Reducir una foto antes de que ocupe memoria de verdad.
 *
 * El recortador cargaba la foto original con `new Image()` y la dibujaba en un
 * canvas. El peso del fichero no dice nada del coste: lo que ocupa es la imagen
 * DESCOMPRIMIDA, cuatro bytes por píxel. Una foto de un iPhone reciente a 48 MP
 * son unos 190 MB en memoria, y en el webview de iOS eso es un cierre por
 * presión de memoria. El tope de 15 MB que ya había mide el fichero comprimido,
 * que no guarda relación: un JPEG de 72 kB puede descomprimirse a 47 MB.
 *
 * Aquí se decodifica directamente al tamaño que hace falta, sin pasar por el
 * original entero, y se libera el bitmap a mano en vez de esperar al recolector.
 */

/** Lado del avatar que se sube. Se enseña como mucho a 96 px. */
export const OUTPUT_SIZE = 512;

/** Acercamiento máximo que permite el recortador. */
export const MAX_ZOOM = 3;

/**
 * Al máximo acercamiento se ve 1/MAX_ZOOM del lado corto, y ese trozo tiene que
 * seguir dando OUTPUT_SIZE píxeles. De ahí sale el número: no es arbitrario, y
 * si cambia el zoom o el tamaño de salida se recalcula solo.
 */
export const MAX_SHORT_SIDE = OUTPUT_SIZE * MAX_ZOOM;

/** Tope aparte para panorámicas, donde el lado corto no acota nada. */
export const MAX_LONG_SIDE = 4096;

export interface Size {
  width: number;
  height: number;
  /** false si la imagen ya cabía: entonces no hay que reencodar nada. */
  scaled: boolean;
}

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Tamaño al que conviene decodificar, conservando la proporción.
 * Nunca amplía: una foto ya pequeña se queda como está.
 */
export function fitWithin(
  width: number,
  height: number,
  shortMax: number = MAX_SHORT_SIDE,
  longMax: number = MAX_LONG_SIDE,
): Size {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return { width: 0, height: 0, scaled: false };
  }
  const scale = Math.min(
    1,
    shortMax / Math.min(width, height),
    longMax / Math.max(width, height),
  );
  if (scale >= 1) return { width, height, scaled: false };
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scaled: true,
  };
}

/**
 * Encaja el recorte dentro de la imagen.
 *
 * react-easy-crop devuelve píxeles redondeados, que pueden salirse un punto por
 * el borde. `drawImage` no se queja: rellena lo que sobra con transparente, y
 * como la salida es JPEG eso acaba siendo una raya negra en el avatar.
 */
export function clampArea(area: CropArea, width: number, height: number): CropArea {
  const x = Math.max(0, Math.min(Math.round(area.x), Math.max(0, width - 1)));
  const y = Math.max(0, Math.min(Math.round(area.y), Math.max(0, height - 1)));
  return {
    x,
    y,
    width: Math.max(1, Math.min(Math.round(area.width), width - x)),
    height: Math.max(1, Math.min(Math.round(area.height), height - y)),
  };
}

/** Carga con <img>. Solo se usa como respaldo y para leer el tamaño. */
function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // Ya está cargada: soltar la URL no invalida lo que hay en memoria.
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('DECODE_FAILED'));
    };
    img.src = url;
  });
}

/**
 * Ancho y alto reales.
 *
 * El elemento no se mete nunca en el documento ni se pinta, así que el navegador
 * se queda en la cabecera del fichero y no llega a rasterizar. Se suelta acto
 * seguido.
 */
export async function readImageSize(file: Blob): Promise<{ width: number; height: number }> {
  const img = await loadImage(file);
  return { width: img.naturalWidth, height: img.naturalHeight };
}

interface Decoded {
  source: ImageBitmap | HTMLImageElement;
  /** Libera el bitmap sin esperar al recolector. */
  release: () => void;
}

/**
 * El tamaño real de lo decodificado. En un <img> hay que mirar `naturalWidth`:
 * `width` refleja el tamaño de maquetación, que en un elemento que no está en
 * el documento no tiene por qué coincidir.
 */
const sourceSize = (source: ImageBitmap | HTMLImageElement) =>
  'naturalWidth' in source
    ? { width: source.naturalWidth, height: source.naturalHeight }
    : { width: source.width, height: source.height };

/** Decodifica ya al tamaño pedido, si el navegador sabe. */
async function decode(file: Blob, width?: number, height?: number): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(
        file,
        width && height
          ? { resizeWidth: width, resizeHeight: height, resizeQuality: 'high', imageOrientation: 'from-image' }
          : { imageOrientation: 'from-image' },
      );
      return { source: bitmap, release: () => bitmap.close() };
    } catch {
      // Hay navegadores que rechazan las opciones en vez de ignorarlas.
    }
  }
  const img = await loadImage(file);
  return { source: img, release: () => {} };
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('ENCODE_FAILED'))),
      'image/jpeg',
      quality,
    );
  });
}

/**
 * La foto reducida a lo que el recortador necesita.
 *
 * Devuelve el mismo fichero si ya cabía, para no reencodar de balde ni perder
 * calidad. Lo que salga de aquí es lo que se enseña Y lo que se recorta después:
 * así las coordenadas que da el recortador ya están en este espacio y no hay
 * ninguna conversión que pueda descuadrarse.
 */
export async function downscaleForCrop(file: Blob): Promise<Blob> {
  const { width, height } = await readImageSize(file);
  const target = fitWithin(width, height);
  if (!target.scaled) return file;

  const { source, release } = await decode(file, target.width, target.height);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('NO_CANVAS');
    // Al tamaño destino pase lo que pase: si el navegador ignoró las opciones
    // de redimensionado, el resultado queda acotado igualmente.
    ctx.drawImage(source, 0, 0, target.width, target.height);
    return await toBlob(canvas, 0.92);
  } finally {
    release();
  }
}

/** Recorta un cuadrado y lo deja en JPEG, listo para subir. */
export async function cropToSquare(
  file: Blob,
  area: CropArea,
  size: number = OUTPUT_SIZE,
): Promise<Blob> {
  const { source, release } = await decode(file);
  try {
    const { width: sw, height: sh } = sourceSize(source);
    const box = clampArea(area, sw, sh);

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('NO_CANVAS');
    ctx.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, size, size);
    return await toBlob(canvas, 0.9);
  } finally {
    release();
  }
}
