import { useCallback, useEffect, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Lado del avatar que se sube. Se muestra como mucho a 96px, así que 512
 *  sobra para pantallas retina y deja el archivo en unos pocos kB. */
const OUTPUT_SIZE = 512;

interface Props {
  file: File;
  onCancel: () => void;
  onCropped: (file: File) => void;
}

/**
 * Recorte cuadrado antes de subir. Sin esto la foto se guardaba entera y el
 * `object-cover` del avatar decidía por su cuenta qué parte enseñar, que casi
 * nunca era la cara.
 */
export function AvatarCropper({ file, onCancel, onCropped }: Props) {
  const { t } = useTranslation();
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    // Sin esto cada foto elegida deja su blob colgado en memoria.
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onCropComplete = useCallback((_: Area, pixels: Area) => setArea(pixels), []);

  const handleConfirm = async () => {
    if (!src || !area) return;
    setWorking(true);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('DECODE_FAILED'));
        el.src = src;
      });

      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('NO_CANVAS');
      ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

      // Siempre JPEG: normaliza HEIC y PNG enormes a un archivo pequeño y de
      // tipo conocido, así que ni el peso ni el formato de origen importan.
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.9)
      );
      if (!blob) throw new Error('ENCODE_FAILED');

      onCropped(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
    } catch {
      setFailed(true);
      setWorking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-foreground/95 animate-fade-in">
      <div className="px-5 pt-5 pb-3 text-center">
        <h2 className="text-lg font-extrabold text-background">{t('profile.adjustPhoto')}</h2>
        <p className="text-xs text-background/70 mt-1">{t('profile.adjustPhotoHint')}</p>
      </div>

      <div className="relative flex-1 min-h-0">
        {src && (
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        )}
      </div>

      <div className="px-5 py-4 space-y-4 safe-bottom">
        {failed && (
          <p className="text-xs text-destructive text-center">{t('profile.photoError')}</p>
        )}

        {/* Control de zoom además del pellizco: en escritorio no hay pellizco. */}
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          aria-label={t('profile.zoom')}
          className="w-full accent-primary"
        />

        <div className="flex gap-3">
          <Button variant="outline" onClick={onCancel} disabled={working} className="h-12 rounded-xl px-6">
            {t('common.cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={working || !area} className="flex-1 h-12 rounded-xl font-bold">
            {working ? <Loader2 className="w-4 h-4 animate-spin" /> : t('profile.usePhoto')}
          </Button>
        </div>
      </div>
    </div>
  );
}
