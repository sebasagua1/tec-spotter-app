-- ============================================================
-- Siembra de universidades mexicanas
--
-- Con el aislamiento por institución activo, la tabla no puede tener una sola
-- fila: quien no sea del Tec tendría que elegir el Tec o quedarse fuera.
--
-- SOBRE LA FIABILIDAD DE ESTOS DATOS:
--
--   · Los dominios están comprobados: los 20 tienen registros MX activos. Eso
--     confirma que existen y reciben correo. NO confirma que los alumnos
--     tengan cuenta ahí — en varias universidades el dominio principal es de
--     personal y los alumnos usan un subdominio. Donde lo conozco, van los dos.
--     Si un dominio está mal, esos alumnos no quedan inscritos solos: tendrán
--     que elegir su universidad a mano y saldrán como no verificados.
--
--   · Las coordenadas son APROXIMADAS, de memoria, y no las he verificado. Solo
--     deciden dónde abre el mapa. Un error de cientos de metros no se nota; uno
--     de kilómetros sí. Revisa las de los campus que te importen antes de fiarte.
--
--   · Varias universidades tienen muchos campus. Aquí va uno por universidad,
--     el principal. Si necesitas separar campus, añade filas con su propio slug.
--
-- Idempotente: ON CONFLICT DO NOTHING, así que re-ejecutarla no duplica nada
-- ni pisa lo que ya hayas corregido a mano.
-- ============================================================

BEGIN;

INSERT INTO public.institutions (name, slug, email_domains, lat, lng) VALUES
  ('Universidad Nacional Autónoma de México',        'unam',    ARRAY['unam.mx', 'comunidad.unam.mx'], 19.3320,  -99.1870),
  ('Instituto Politécnico Nacional',                 'ipn',     ARRAY['ipn.mx', 'alumno.ipn.mx'],      19.5045,  -99.1470),
  ('Universidad de Guadalajara',                     'udg',     ARRAY['udg.mx', 'alumnos.udg.mx'],     20.6560, -103.3250),
  ('Universidad Autónoma de Nuevo León',             'uanl',    ARRAY['uanl.edu.mx'],                  25.7250, -100.3130),
  ('Universidad Autónoma Metropolitana',             'uam',     ARRAY['uam.mx'],                       19.3650,  -99.0740),
  ('Benemérita Universidad Autónoma de Puebla',      'buap',    ARRAY['buap.mx', 'alumno.buap.mx'],    19.0000,  -98.2030),
  ('Universidad Autónoma del Estado de México',      'uaemex',  ARRAY['uaemex.mx'],                    19.2900,  -99.6700),
  ('Universidad Autónoma de San Luis Potosí',        'uaslp',   ARRAY['uaslp.mx'],                     22.1500, -100.9800),
  ('Universidad Autónoma de Querétaro',              'uaq',     ARRAY['uaq.mx'],                       20.5880, -100.4050),
  ('Universidad Iberoamericana',                     'ibero',   ARRAY['ibero.mx'],                     19.3770,  -99.2620),
  ('Instituto Tecnológico Autónomo de México',       'itam',    ARRAY['itam.mx'],                      19.3480,  -99.2060),
  ('Universidad Anáhuac',                            'anahuac', ARRAY['anahuac.mx'],                   19.4190,  -99.3020),
  ('Universidad de las Américas Puebla',             'udlap',   ARRAY['udlap.mx'],                     19.0540,  -98.2830),
  ('Universidad Panamericana',                       'up',      ARRAY['up.edu.mx'],                    19.3520,  -99.1900),
  ('El Colegio de México',                           'colmex',  ARRAY['colmex.mx'],                    19.3020,  -99.2050),
  ('Centro de Investigación y Docencia Económicas',  'cide',    ARRAY['cide.edu'],                     19.3720,  -99.2670)
ON CONFLICT DO NOTHING;

COMMIT;
