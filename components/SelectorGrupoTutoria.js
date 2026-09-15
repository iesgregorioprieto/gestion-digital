'use client';

/**
 * SELECTOR DE GRUPO DE TUTORÍA
 *
 * Los grupos salen de los que existen de verdad en el alumnado, no de
 * una lista escrita a mano. La lista tecleada se quedaba vieja cada
 * septiembre: le faltaba GS-2AAD, ofrecía GS-1VIT cuando el grupo se
 * llama GS-1VITI, y tenía grupos que ya no existen. Los tutores cuyo
 * grupo no aparecía acababan escribiéndolo a mano en otro sitio, y
 * entonces no veían a su propia tutoría en autorizaciones.
 *
 * Si el valor guardado no está entre los grupos actuales —porque es de
 * un curso anterior— se muestra igualmente, avisado, para que se vea que
 * hay que cambiarlo en vez de perderlo en silencio.
 */

import { useState, useEffect } from 'react';

const FAMILIAS = [
  ['ESO',  'ESO'],
  ['BTO',  'Bachillerato'],
  ['GB',   'FP Básica'],
  ['GM',   'Grado Medio'],
  ['GS',   'Grado Superior'],
];

export default function SelectorGrupoTutoria({ valor, onChange, estilo }) {
  const [grupos, setGrupos] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    fetch('/api/alumnos?grupos=1')
      .then(r => r.ok ? r.json() : { grupos: [] })
      .then(d => { if (vivo) { setGrupos(d.grupos || []); setCargando(false); } })
      .catch(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, []);

  const porFamilia = FAMILIAS.map(([prefijo, titulo]) => [
    titulo,
    grupos.filter(g => g.toUpperCase().startsWith(prefijo + '-')
                    || g.toUpperCase().startsWith(prefijo + ' ')),
  ]).filter(([, lista]) => lista.length > 0);

  const yaClasificados = new Set(porFamilia.flatMap(([, l]) => l));
  const otros = grupos.filter(g => !yaClasificados.has(g));
  const desconocido = valor && grupos.length > 0 && !grupos.includes(valor);

  return (
    <>
      <select value={valor || ''} onChange={e => onChange(e.target.value)}
        style={{ ...estilo, borderColor: !valor ? '#fca5a5' : (desconocido ? '#fbbf24' : '#ddd') }}>
        <option value="">
          {cargando ? 'Cargando grupos…' : '— Selecciona el grupo —'}
        </option>
        {desconocido && (
          <option value={valor}>{valor} — grupo de otro curso</option>
        )}
        {porFamilia.map(([titulo, lista]) => (
          <optgroup key={titulo} label={titulo}>
            {lista.map(g => <option key={g} value={g}>{g}</option>)}
          </optgroup>
        ))}
        {otros.length > 0 && (
          <optgroup label="Otros">
            {otros.map(g => <option key={g} value={g}>{g}</option>)}
          </optgroup>
        )}
      </select>

      {desconocido && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#92400e', fontWeight: 600 }}>
          «{valor}» no corresponde a ningún grupo del alumnado de este curso.
          Mientras siga así, no verá a su tutoría en autorizaciones.
        </div>
      )}
      {!cargando && grupos.length === 0 && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#92400e', fontWeight: 600 }}>
          Todavía no hay alumnado importado, así que no hay grupos que elegir.
          Impórtalo primero y vuelve a esta ficha.
        </div>
      )}
    </>
  );
}
