import { X, Check, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  onConfirm: () => void;
  onCancel: () => void;
  hasPin: boolean;
}

export function LocationPickerOverlay({ onConfirm, onCancel, hasPin }: Props) {
  const { t } = useTranslation();
  return (
    <div className="absolute top-4 left-0 right-0 z-20 px-4 safe-top">
      <div className="flex items-center gap-3 bg-card/95 backdrop-blur-md rounded-2xl shadow-lifted p-3 mx-auto max-w-[430px]">
        <button
          onClick={onCancel}
          className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0"
        >
          <X className="w-5 h-5 text-foreground" />
        </button>
        <span className="text-sm font-semibold text-foreground flex-1 text-center flex items-center justify-center gap-1.5">
          <MapPin className="w-4 h-4 flex-shrink-0" />
          {t('create.pickOnMap')}
        </span>
        {hasPin && (
          <button
            onClick={onConfirm}
            className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0"
          >
            <Check className="w-5 h-5 text-primary-foreground" />
          </button>
        )}
      </div>
    </div>
  );
}
