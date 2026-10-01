/**
 * NOMBRES DE GRUPO
 *
 * El mismo grupo se escribe de varias formas según de dónde venga: en la
 * ficha del tutor alguien teclea "2º DDC", en el listado de alumnos
 * importado de Delphos pone "2DDC", y en otro sitio "2 D.D.C.". Comparar
 * esas cadenas tal cual hace que un tutor no vea a su propia tutoría.
 *
 * Aquí se comparan por su forma reducida: sin tildes, sin espacios, sin
 * puntos ni guiones, sin las voladitas de "1º" o "2ª", y en mayúsculas.
 * "2º DDC", "2 ddc" y "2-DDC" son el mismo grupo.
 */

export function normGrupo(g) {
  return (g || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[ºª°]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

/**
 * Clave del grupo que no depende del ORDEN: Delphos escribe «4ESO-C» y
 * Peñalara «ESO-4C»; para normGrupo eran «4ESOC» y «ESO4C», dos grupos
 * distintos, y la lista de grupos salía con cada uno dos veces.
 * La clave es etapa + número + letras: las dos dan «ESO4C».
 */
export function claveGrupo(g) {
  const n = normGrupo(g);
  const m = n.match(/^(\d+)?(ESO|BTO|BACH|GM|GS|GB|FPB|FPPE)(\d+)?(.*)$/);
  if (!m || (!m[1] && !m[3])) return n;
  return `${m[2] === 'BACH' ? 'BTO' : m[2]}${m[1] || m[3]}${m[4]}`;
}

/**
 * ¿Son el mismo grupo? Sin importar tildes, guiones, espacios NI EL ORDEN:
 * «2ESO-A» (escrito a mano en la ficha) y «ESO-2A» (Delphos) son el mismo.
 * Antes solo se quitaban símbolos, y 8 tutores no veían a sus alumnos en
 * autorizaciones y seguro por tener la tutoría escrita «al revés».
 */
export function mismoGrupo(a, b) {
  const x = claveGrupo(a);
  const y = claveGrupo(b);
  return !!x && x === y;
}

/**
 * Devuelve el nombre del grupo TAL COMO ESTÁ GUARDADO, a partir de
 * cualquier forma de escribirlo. Así se consulta con el valor real de la
 * base de datos en vez de con lo que tecleó una persona.
 */
export function resolverGrupo(buscado, existentes = []) {
  if (!buscado) return null;
  const exacto = existentes.find(g => g === buscado);
  if (exacto) return exacto;
  return existentes.find(g => mismoGrupo(g, buscado)) || null;
}

/**
 * ¿Es un grupo de CICLO DE GRADO MEDIO O SUPERIOR?
 *
 * Se usa para la regla de 6ª: en GM y GS los alumnos se van a casa y la
 * falta del profesor no genera guardia. En GRADO BÁSICO (también el GBE
 * de Agraria) SÍ se cubre: así lo decidió José María (oct. 2026). Los
 * profesores de guardia anotan las incidencias que haya.
 *
 * El horario no trae el grupo limpio: trae materia, código, grupo y aula
 * pegados, y a veces varios grupos seguidos sin separador:
 *
 *   «LMSG-3092638GS-1ASIR(1 A009 INF)»                    → true
 *   «CAMP-3095597GS-1DDC(7 G101)»                         → true
 *   «GM-2CAR», «GS-1TLO», «2GM»                           → true
 *   «CAII-3101817GB-2CR(5 E008 AUL)CAII-3101177GB-2EE»    → false (Básico)
 *   «GBE-1AGR», «FPB-1»                                   → false (Básico)
 *   «ESO-4A», «4ESO-C», «BTO-1B»                          → false
 *   vacío o sin etapa reconocible                         → null (no se sabe)
 *
 * Solo cuenta si TODAS las etapas que aparecen son GM o GS: basta un grupo
 * de Básico, ESO o Bachillerato para que haya alumnos que se quedan.
 */
const ETAPA = /(?<![A-Z])(CFGBE|CFGB|CFGM|CFGS|FPGBE|FPGB|FPBE|FPB|GBE|GB|GM|GS|ESO|BTO|BACH)(?=[-\s\d]|$)/g;
const ETAPAS_SE_VAN = ['CFGM', 'CFGS', 'GM', 'GS'];

export function esGrupoCiclo(grupo) {
  const texto = String(grupo || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\([^)]*\)/g, ' ');
  const etapas = [...texto.matchAll(ETAPA)].map(m => m[1]);
  if (etapas.length === 0) return null;
  return etapas.every(e => ETAPAS_SE_VAN.includes(e));
}
