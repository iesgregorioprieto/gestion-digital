'use client';
import Link from 'next/link';
import { describirAula } from '@/lib/edificios';

/**
 * «Edificio B · 1ª planta» junto al aula de una guardia, con el color del
 * edificio. Al tocarlo abre /aulas con el edificio iluminado en el croquis.
 * Si el código no sigue la regla (letra + tres cifras), no pinta nada.
 */
export default function AulaEdificio({ aula, tamano = 12 }) {
  const info = describirAula(aula);
  if (!info) return null;
  return (
    <Link href={`/aulas?aula=${info.codigo}`}
          title={`${info.edificio} · ${info.planta} — ver en el croquis`}
          style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:tamano, fontWeight:700,
                   color:'#0f172a', textDecoration:'none', backgroundColor:'#f8fafc',
                   border:'1px solid #cbd5e1', borderRadius:6, padding:'2px 8px', whiteSpace:'nowrap' }}>
      <span style={{ display:'inline-grid', placeItems:'center', width:tamano + 6, height:tamano + 6,
                     borderRadius:4, backgroundColor:info.color, fontWeight:800, fontSize:tamano - 1 }}>
        {info.letra}
      </span>
      Edificio {info.letra} · {info.planta}
    </Link>
  );
}
