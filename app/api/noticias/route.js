/**
 * NOTICIAS DE LA WEB DEL CENTRO
 *
 * Trae las últimas entradas de somosdelprieto.com (WordPress) para
 * mostrarlas en el panel de la sala de profesores.
 *
 * Se pide desde el servidor y no desde el navegador por dos motivos:
 * el navegador lo bloquearía por seguridad al ser otro dominio, y así
 * la respuesta se guarda en caché y no se molesta a la web del centro
 * cada vez que alguien abre el panel.
 */

const WEB = 'https://somosdelprieto.com';
const CUANTAS = 5;

/** Convierte las entidades HTML de WordPress en texto normal */
function limpiar(texto) {
  if (!texto) return '';
  return String(texto)
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&#8217;|&#8216;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8211;|&#8212;/g, '—')
    .replace(/&hellip;/g, '…')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export async function GET() {
  try {
    const resp = await fetch(
      `${WEB}/wp-json/wp/v2/posts?per_page=${CUANTAS}&_embed=wp:featuredmedia`,
      {
        headers: { 'User-Agent': 'PortalIESGregorioPrieto/1.0' },
        // La web del centro se consulta como mucho cada cuarto de hora
        next: { revalidate: 900 },
      }
    );

    if (!resp.ok) {
      return Response.json({ noticias: [], error: 'web_no_disponible' });
    }

    const entradas = await resp.json();

    const noticias = (Array.isArray(entradas) ? entradas : []).map(p => {
      let imagen = '';
      try {
        const media = p._embedded?.['wp:featuredmedia']?.[0];
        imagen = media?.media_details?.sizes?.medium?.source_url
              || media?.source_url
              || '';
      } catch (_) { imagen = ''; }

      return {
        id: p.id,
        titulo: limpiar(p.title?.rendered),
        resumen: limpiar(p.excerpt?.rendered).slice(0, 220),
        fecha: p.date || '',
        enlace: p.link || '',
        imagen,
      };
    }).filter(n => n.titulo);

    return Response.json({ noticias });
  } catch (e) {
    console.error('noticias del centro:', e?.message);
    return Response.json({ noticias: [], error: 'fallo_al_consultar' });
  }
}
