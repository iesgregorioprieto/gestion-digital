'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { consulta } from '@/lib/consulta';
import { EDIFICIOS, PLANTAS, describirAula, normalizaAula, aulaDeGrupo } from '@/lib/edificios';

/**
 * ¿DÓNDE ESTÁ EL AULA?
 *
 * El profesor escribe el aula de su horario o de la guardia y le sale el
 * edificio y la planta, con un croquis de colores donde se ilumina el
 * edificio. Tocando un edificio ve sus aulas con clase, por plantas.
 * Se puede abrir ya marcada: /aulas?aula=B102
 */

const azul = '#1e3a5f';

function Croquis({ marcado, onElegir }) {
  return (
    <svg viewBox="0 0 1000 620" style={{ display:'block', width:'100%', height:'auto' }}
         role="group" aria-label="Croquis del recinto">
      <rect x={340} y={60} width={250} height={380} rx={14} fill="#eef2f6" />
      <text x={465} y={255} textAnchor="middle" fill="#94a3b8" fontSize={16} fontWeight={700}>Pistas</text>
      {Object.entries(EDIFICIOS).map(([L, d]) => {
        const on = marcado === L;
        const apagado = marcado && !on;
        const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
        // Parte el nombre en líneas que quepan en el bloque
        const max = Math.max(6, Math.floor(d.w / 11));
        const lineas = []; let cur = '';
        for (const w of d.nombre.split(' ')) {
          if ((cur + ' ' + w).trim().length > max && cur) { lineas.push(cur); cur = w; }
          else cur = (cur + ' ' + w).trim();
        }
        lineas.push(cur);
        return (
          <g key={L} role="button" tabIndex={0} aria-label={`Edificio ${L}, ${d.nombre}`}
             style={{ cursor:'pointer' }} onClick={() => onElegir(L)}
             onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onElegir(L); } }}>
            <rect x={d.x} y={d.y} width={d.w} height={d.h} rx={10} fill={d.color}
                  opacity={apagado ? 0.28 : 1}
                  stroke={on ? '#0f172a' : 'white'} strokeWidth={on ? 6 : 3} />
            <text x={cx} y={cy - 4} textAnchor="middle" fontSize={44} fontWeight={800}
                  fill="#0f172a" opacity={apagado ? 0.4 : 1} style={{ pointerEvents:'none' }}>{L}</text>
            {lineas.map((t, i) => (
              <text key={i} x={cx} y={cy + 22 + i * 19} textAnchor="middle" fontSize={17} fontWeight={700}
                    fill="#0f172a" opacity={apagado ? 0.4 : 1} style={{ pointerEvents:'none' }}>{t}</text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function AulasContenido() {
  const params = useSearchParams();
  const router = useRouter();
  const [texto, setTexto] = useState(params.get('aula') || '');
  const [edificio, setEdificio] = useState(null);     // letra tocada en el croquis
  const [aulas, setAulas] = useState(null);           // aulas con clase, se cargan al tocar un edificio

  const info = describirAula(texto);
  const marcado = info ? info.letra : edificio;

  // Las aulas del horario solo hacen falta si alguien toca un edificio
  useEffect(() => {
    if (!edificio || aulas) return;
    (async () => {
      // Supabase devuelve como mucho 1000 filas por petición y el horario
      // tiene casi 3000, así que se pide por tramos.
      const s = new Set();
      for (let desde = 0; desde < 20000; desde += 1000) {
        const { data } = await consulta('horarios_profesores').select('aula, grupo')
          .range(desde, desde + 999).ejecutar();
        (data || []).forEach(r => {
          const a = describirAula(r.aula) ? normalizaAula(r.aula) : aulaDeGrupo(r.grupo);
          if (a) s.add(a);
        });
        if (!data || data.length < 1000) break;
      }
      setAulas([...s].sort());
    })();
  }, [edificio, aulas]);

  function elegirEdificio(L) { setTexto(''); setEdificio(L); }
  function elegirAula(a) { setTexto(a); setEdificio(null); }

  const escrito = normalizaAula(texto);
  let titulo, detalle, letra = null, color = '#e2e8f0';
  if (info) {
    titulo = `${info.codigo} · ${info.edificio} · ${info.planta}`;
    detalle = `Edificio ${info.letra}`;
    letra = info.letra; color = info.color;
  } else if (escrito && !edificio) {
    titulo = 'Escribe la letra y los tres números del aula';
    detalle = 'Por ejemplo: A110, B102, E003';
  } else if (edificio) {
    const n = aulas ? aulas.filter(a => a[0] === edificio).length : null;
    titulo = `Edificio ${edificio} · ${EDIFICIOS[edificio].nombre}`;
    detalle = n == null ? 'Cargando aulas…' : `${n} aula${n !== 1 ? 's' : ''} con clase`;
    letra = edificio; color = EDIFICIOS[edificio].color;
  } else {
    titulo = 'La letra es el edificio y el número, la planta';
    detalle = 'A1… es el edificio A, primera planta';
  }

  const delEdificio = edificio && aulas ? aulas.filter(a => a[0] === edificio) : [];

  return (
    <div style={{ minHeight:'100vh', backgroundColor:'#f1f5f9', padding:'16px 16px 40px' }}>
      <div style={{ maxWidth:820, margin:'0 auto', display:'grid', gap:14 }}>
        <div>
          <button onClick={() => router.back()}
                  style={{ background:'none', border:'none', color:azul, fontWeight:700, fontSize:14, padding:0, cursor:'pointer' }}>
            ← Volver
          </button>
          <h1 style={{ fontSize:22, color:azul, margin:'8px 0 2px' }}>¿Dónde está el aula?</h1>
          <p style={{ color:'#64748b', margin:0, fontSize:14.5 }}>
            Escribe el aula de tu horario o de la guardia, o toca un edificio.
          </p>
        </div>

        <input id="aula-buscar" value={texto} onChange={e => { setTexto(e.target.value); setEdificio(null); }}
               placeholder="Ej.: A110" autoComplete="off" aria-label="Código de aula"
               style={{ width:'100%', boxSizing:'border-box', fontSize:20, fontWeight:700, letterSpacing:1,
                        textTransform:'uppercase', fontFamily:'ui-monospace, monospace',
                        padding:'12px 14px', border:'2px solid #cbd5e1', borderRadius:10, backgroundColor:'white' }} />

        <div aria-live="polite" style={{ display:'flex', gap:14, alignItems:'center', backgroundColor:'white',
             border:'1px solid #e2e8f0', borderRadius:12, padding:14 }}>
          <div style={{ flex:'none', width:56, height:56, borderRadius:10, backgroundColor:color,
                        display:'grid', placeItems:'center', fontSize:28, fontWeight:800,
                        color: letra ? '#0f172a' : '#94a3b8' }}>
            {letra || '?'}
          </div>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:18, fontWeight:800, color:'#0f172a', lineHeight:1.25 }}>{titulo}</div>
            <div style={{ fontSize:14, color:'#64748b', marginTop:2 }}>{detalle}</div>
          </div>
        </div>

        <div style={{ backgroundColor:'white', border:'1px solid #e2e8f0', borderRadius:12, padding:8 }}>
          <Croquis marcado={marcado} onElegir={elegirEdificio} />
        </div>

        {delEdificio.length > 0 && (
          <div style={{ display:'grid', gap:8 }}>
            {[0, 1, 2].map(p => {
              const lista = delEdificio.filter(a => a[1] === String(p));
              if (!lista.length) return null;
              return (
                <div key={p}>
                  <div style={{ fontSize:12.5, fontWeight:800, color:'#64748b', textTransform:'uppercase',
                                letterSpacing:0.5, marginBottom:6 }}>{PLANTAS[p]}</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                    {lista.map(a => (
                      <button key={a} onClick={() => elegirAula(a)}
                              style={{ fontFamily:'ui-monospace, monospace', fontWeight:700, fontSize:15,
                                       padding:'6px 10px', borderRadius:8, border:'1px solid #cbd5e1',
                                       backgroundColor:'white', cursor:'pointer' }}>{a}</button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p style={{ color:'#94a3b8', fontSize:13, margin:0 }}>
          Croquis orientativo del recinto.
        </p>
      </div>
    </div>
  );
}

export default function AulasPage() {
  return (
    <Suspense fallback={null}>
      <AulasContenido />
    </Suspense>
  );
}
