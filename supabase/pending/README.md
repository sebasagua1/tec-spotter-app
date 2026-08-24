# Migraciones pendientes (no aplicadas)

SQL listo pero **desactivado a propósito**. Supabase ignora esta carpeta:
no se aplica con `supabase db push` ni con `db reset`.

## restrict-tec-email-domain.sql

> **SUPERADA — ya se puede borrar.** La sustituyó
> `migrations/20260828000000_institutions.sql`, que resuelve la pertenencia
> por dominio contra `institutions.email_domains` en el trigger de alta.
> Aquella cerraba el registro; esta lo deja abierto y acredita quién es de la
> institución. No las mezcles: aplicar ambas rechazaría altas que el modelo
> nuevo quiere aceptar.

Restringe el registro a correos institucionales del Tec (`@tec.mx`,
`@exatec.mx`, `@itesm.mx`) mediante un trigger en `auth.users`.

**Cómo activarla cuando quieras cerrar el registro al campus:**
1. Pega su contenido en el **SQL Editor** de Supabase y ejecútalo
   (o muévela de vuelta a `supabase/migrations/` y corre `supabase db push`).
2. Pon `VITE_RESTRICT_TEC_EMAIL=true` en el entorno de Vercel y redeploy
   (activa el chequeo/hint en el frontend).

Ambos lados deben coincidir: el servidor es la fuente de verdad, el
frontend es solo UX.
