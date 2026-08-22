import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

const NotFound = () => {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-8">
      <div className="text-center">
        <h1 className="mb-2 text-4xl font-extrabold text-foreground">404</h1>
        <p className="mb-6 text-sm text-muted-foreground">{t('notFound.message')}</p>
        {/* Link y no <a href>: con <a> se recargaba la app entera y se perdía
            la sesión en memoria, además de volver a descargar el bundle. */}
        <Link
          to="/"
          className="inline-flex h-11 items-center rounded-xl bg-primary px-6 font-semibold text-primary-foreground"
        >
          {t('notFound.back')}
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
