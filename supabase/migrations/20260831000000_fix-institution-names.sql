-- ============================================================
-- Reparacion: acentos rotos en los nombres de las instituciones
--
-- Los nombres entraron con mojibake (se veia "Quer" seguido de dos simbolos raros en vez de la e
-- acentuada). La causa fue el portapapeles de macOS: pbcopy con la variable LANG
-- vacia etiqueta el contenido como Mac Roman, y el navegador lo reconvierte
-- como si lo fuera, convirtiendo cada byte UTF-8 en dos caracteres.
--
-- Este archivo es ASCII PURO a proposito. Los nombres van con escapes Unicode
-- (U&'...\00E9...'), de modo que ningun portapapeles, editor ni terminal mal
-- configurado puede volver a corromperlos. Postgres los expande al ejecutar.
--
-- Se corrige por slug, que es ASCII y llego intacto, asi que da igual como
-- haya quedado el nombre.
--
-- Idempotente: ejecutarla dos veces no cambia nada la segunda vez.
-- ============================================================

BEGIN;

UPDATE public.institutions i
SET name = c.nombre
FROM (VALUES
    ('tec-mty-qro', U&'Tec de Monterrey Campus Quer\00E9taro'),
    ('unam', U&'Universidad Nacional Aut\00F3noma de M\00E9xico'),
    ('ipn', U&'Instituto Polit\00E9cnico Nacional'),
    ('udg', 'Universidad de Guadalajara'),
    ('uanl', U&'Universidad Aut\00F3noma de Nuevo Le\00F3n'),
    ('uam', U&'Universidad Aut\00F3noma Metropolitana'),
    ('buap', U&'Benem\00E9rita Universidad Aut\00F3noma de Puebla'),
    ('uaemex', U&'Universidad Aut\00F3noma del Estado de M\00E9xico'),
    ('uaslp', U&'Universidad Aut\00F3noma de San Luis Potos\00ED'),
    ('uaq', U&'Universidad Aut\00F3noma de Quer\00E9taro'),
    ('ibero', 'Universidad Iberoamericana'),
    ('itam', U&'Instituto Tecnol\00F3gico Aut\00F3nomo de M\00E9xico'),
    ('anahuac', U&'Universidad An\00E1huac'),
    ('udlap', U&'Universidad de las Am\00E9ricas Puebla'),
    ('up', 'Universidad Panamericana'),
    ('colmex', U&'El Colegio de M\00E9xico'),
    ('cide', U&'Centro de Investigaci\00F3n y Docencia Econ\00F3micas')
) AS c(slug, nombre)
WHERE i.slug = c.slug
  AND i.name IS DISTINCT FROM c.nombre;

COMMIT;
