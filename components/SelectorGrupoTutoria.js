'use client';

/**
 * SELECTOR DE GRUPO DE TUTORÍA
 *
 * Los grupos son los reales del curso: los de los horarios (Peñalara), los
 * del alumnado y la lista oficial, sin duplicados («4ESO-C» y «ESO-4C» son
 * uno). Arriba salen «Tus grupos»: los que el profesor tiene en su horario.
 * Cada grupo lleva cuántos alumnos tiene, para que el tutor sepa que va a
 * verlos al marcar autorizaciones y seguro escolar.
 *
 * Elegir la tutoría solo cambia QUÉ alumnos ve el tutor. Los seguros y
 * autorizaciones están guardados en cada alumno y no se tocan.
 *
 * profesorId: de quién son «Tus grupos» (en la ficha de secretaría, el
 * profesor que se edita). Sin él, los de quien tiene la sesión.
 */

import { useState, useEffect } from 'react';
import { mismoGrupo } from '@/lib/grupos';

const FAMILIAS = [
  ['ESO',  'ESO'],
  ['BTO',  'Bachillerato'],
  ['GB',   'FP Básica'],
  ['GM',   'Grado Medio'],
  ['GS',   'Grado Superior'],
];
const COD = /(ESO|BTO|GB|GM|GS|FPPE)-\d+[A-ZÑ0-9.]*?(?=(?:ESO|BTO|GB|GM|GS|FPPE)-|[^A-ZÑ0-9.]|$)/g;

export default function SelectorGrupoTutoria({ valor, onChange, estilo, profesorId = null }) {
  const [detalle, setDetalle] = useState([]);       // [{ grupo, alumnos }]
  const [mios, setMios] = useState([]);             // grupos de su horario
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    Promise.all([
      fetch('/api/alumnos?grupos=1').then(r => r.ok ? r.json() : {}).catch(() => ({})),
      fetch(`/api/horario-de?de=${profesorId || 'mi'}`).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    ]).then(([g, h]) => {
      if (!vivo) return;
      const lista = g.detalle || (g.grupos || []).map(x => ({ grupo: x, alumnos: null }));
      setDetalle(lista);
      // Grupos a los que da clase según su horario, con el nombre de la lista
      const horas = (h.horas || []).filter(x => x.tipo === 'clase' || /tutor/i.test(x.grupo || ''));
      const vistos = new Map();
      horas.forEach(x => [...String(x.grupo || '').toUpperCase().matchAll(COD)].forEach(m => {
        const en = lista.find(l => mismoGrupo(l.grupo, m[0]));
        if (en) vistos.set(en.grupo, (vistos.get(en.grupo) || 0) + 1);
      }));
      setMios([...vistos].sort((a, b) => b[1] - a[1]).map(([gr]) => gr));
      setCargando(false);
    });
    return () => { vivo = false; };
  }, [profesorId]);

  const etiqueta = d => d.alumnos == null ? d.grupo
    : d.alumnos > 0 ? `${d.grupo} · ${d.alumnos} alumnos` : `${d.grupo} · sin alumnos en la matrícula`;
  const deMios = detalle.filter(d => mios.includes(d.grupo));
  const porFamilia = FAMILIAS.map(([prefijo, titulo]) => [
    titulo, detalle.filter(d => d.grupo.toUpperCase().startsWith(prefijo + '-') || d.grupo.toUpperCase().startsWith(prefijo + ' ')),
  ]).filter(([, l]) => l.length > 0);
  const yaClasificados = new Set(porFamilia.flatMap(([, l]) => l.map(d => d.grupo)));
  const otros = detalle.filter(d => !yaClasificados.has(d.grupo));

  // El valor guardado puede estar escrito de otra forma («2ESO-A»): se
  // muestra como el grupo real si lo es; si no existe, avisado.
  const real = valor ? detalle.find(d => mismoGrupo(d.grupo, valor)) : null;
  const seleccion = real ? real.grupo : (valor || '');
  const desconocido = valor && detalle.length > 0 && !real;
  const elegido = real;

  return (
    <>
      <select value={seleccion} onChange={e => onChange(e.target.value)}
        style={{ ...estilo, borderColor: !valor ? '#fca5a5' : (desconocido ? '#fbbf24' : '#ddd') }}>
        <option value="">{cargando ? 'Cargando grupos…' : '— Selecciona el grupo —'}</option>
        {desconocido && <option value={valor}>{valor} — no coincide con ningún grupo</option>}
        {deMios.length > 0 && (
          <optgroup label="Tus grupos (según tu horario)">
            {deMios.map(d => <option key={'m' + d.grupo} value={d.grupo}>{etiqueta(d)}</option>)}
          </optgroup>
        )}
        {porFamilia.map(([titulo, lista]) => (
          <optgroup key={titulo} label={titulo}>
            {lista.map(d => <option key={d.grupo} value={d.grupo}>{etiqueta(d)}</option>)}
          </optgroup>
        ))}
        {otros.length > 0 && (
          <optgroup label="Otros">
            {otros.map(d => <option key={d.grupo} value={d.grupo}>{etiqueta(d)}</option>)}
          </optgroup>
        )}
      </select>

      {desconocido && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#92400e', fontWeight: 600 }}>
          «{valor}» no coincide con ningún grupo de este curso: por eso no ves a tus alumnos en
          autorizaciones y seguro escolar. Elige tu grupo en la lista y guarda.
        </div>
      )}
      {elegido && elegido.alumnos === 0 && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#92400e' }}>
          Este grupo aún no tiene alumnos en la matrícula. Los verás cuando secretaría la actualice.
        </div>
      )}
      {elegido && elegido.alumnos > 0 && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#166534' }}>
          ✅ Verás a sus {elegido.alumnos} alumnos en autorizaciones y seguro escolar.
        </div>
      )}
      {!cargando && detalle.length === 0 && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#92400e', fontWeight: 600 }}>
          Todavía no hay grupos cargados. Secretaría tiene que importar el alumnado o los horarios.
        </div>
      )}
    </>
  );
}
