import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import es from './locales/es.json';
import en from './locales/en.json';
import { APP_NAME } from '@/lib/brand';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      en: { translation: en },
    },
    fallbackLng: 'es',
    supportedLngs: ['es', 'en'],
    // `defaultVariables` deja {{app}} disponible en TODAS las cadenas sin
    // tener que pasarlo en cada t(). Así el nombre de la marca no vuelve a
    // escribirse a mano en los archivos de traducción.
    interpolation: { escapeValue: false, defaultVariables: { app: APP_NAME } },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'connecttec_lang',
      caches: ['localStorage'],
    },
  });

export default i18n;
