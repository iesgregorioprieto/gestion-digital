'use client';
export const dynamic = 'force-dynamic';
// v2.0 - REWRITE COMPLETO 2026-07-18

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';

const HORAS = ['1', '2', '3', '4', '5', '6'];
const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];

function diaSemanaEs(fecha) {
  const dias = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
  return dias[new Date(fecha+'T12:00:00').getDay()];
}

// Helpers para mapear abreviaturas Delphos → nombre completo
function abreviarApellido(apellidos) {
  if (!apellidos) return '';
  const partes = apellidos.trim().split(/\s+/);
  const primero = partes[0].slice(0, 3);
  const iniciales = partes.slice(1).map(p => p[0]).join('');
  return iniciales ? `${primero}. ${iniciales}` : `${primero}.`;
}

function inicialesNombre(nombre) {
  if (!nombre) return '';
  return nombre.trim().split(/\s+/).map(p => p[0]).join('');
}

function claveAbreviatura(apellidos, nombre) {
  const ap = abreviarApellido(apellidos);
  const nom = inicialesNombre(nombre);
  return `${ap}, ${nom}`.toLowerCase().replace(/\s/g, '');
}

function normAbrev(str) {
  return (str || '').toLowerCase().replace(/\s/g, '');
}

export default function GestionGuardias() {
  const [usuario, setUsuario] = useState(null);
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [guardias, setGuardias] = useState({});
  const [sectores, setSectores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mapaProfesores, setMapaProf] = useState({});

  // CHECK AUTH
  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    const rol = sessionStorage.getItem('profesor_rol_gestion');
    if (!id || !['director','secretario','jefe_estudios'].includes(rol)) {
      window.location.href = '/login';
      return;
    }
    setUsuario({
      id,
      nombre: sessionStorage.getItem('profesor_nombre') || 'Usuario'
    });
  }, []);

  // CARGAR GUARDIAS CUANDO CAMBIA fecha
  useEffect(() => {
    if (!usuario) return;
    cargarGuardias();
  }, [usuario, fecha]);

  async function cargarGuardias() {
    setCargando(true);
    try {
      // Cargar profesores para mapear abreviaturas Delphos → nombre completo
      const { data: profes } = await getSupabase()
        .from('profesores')
        .select('nombre,apellidos');
      const mapa = {};
      (profes || []).forEach(p => {
        mapa[claveAbreviatura(p.apellidos, p.nombre)] = `${p.apellidos}, ${p.nombre}`;
      });
      setMapaProf(mapa);

      // Query simple - trae TODOS los guardias
      const { data, error } = await getSupabase()
        .from('horarios_profesores')
        .select('profesor_nombre_pdf,hora_id,dia,grupo,materia')
        .eq('curso_academico','2025-2026')
        .eq('tipo','guardia');

      if (error) {
        console.error('Error Supabase:', error);
        setCargando(false);
        return;
      }

      if (!data || data.length === 0) {
        console.log('No hay guardias en BD');
        setSectores([]);
        setGuardias({});
        setCargando(false);
        return;
      }

      console.log('✅ Guardias traídos:', data.length);

      // Construir estructura: { sector: { dia: { hora: [profes] } } }
      const estructura = {};

      data.forEach(reg => {
        const sector = (reg.grupo || reg.materia || 'Sin sector').trim();
        const hora = (reg.hora_id || '').replace(/[aª]/g, '').trim();
        const dia = (reg.dia || '').toLowerCase().trim();
        const profe = (reg.profesor_nombre_pdf || 'N/A').trim();

        // Validar
        if (!sector || !hora || !dia || !profe) {
          console.warn('Registro incompleto:', reg);
          return;
        }

        // Crear estructura anidada
        if (!estructura[sector]) estructura[sector] = {};
        if (!estructura[sector][dia]) estructura[sector][dia] = {};
        if (!estructura[sector][dia][hora]) estructura[sector][dia][hora] = [];
        estructura[sector][dia][hora].push(profe);
      });

      const sectorList = Object.keys(estructura).sort();
      console.log('📊 Sectores encontrados:', sectorList.length, '→', sectorList);

      setSectores(sectorList);
      setGuardias(estructura);
    } catch (err) {
      console.error('Error fatal:', err);
    } finally {
      setCargando(false);
    }
  }

  if (!usuario) return <div>Redirigiendo...</div>;

  const diaSem = diaSemanaEs(fecha);
  const esFinDeSemana = diaSem === 'sabado' || diaSem === 'domingo';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5', fontFamily: 'system-ui' }}>
      {/* HEADER */}
      <div style={{ backgroundColor: '#1e3a5f', color: 'white', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>🛡️ Cuadrante de Guardias</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>{usuario.nombre}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="/gestion" style={{ color: 'white', textDecoration: 'none', fontSize: 13, padding: '6px 12px', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6 }}>← Volver</a>
          <button onClick={() => { sessionStorage.clear(); window.location.href = '/login'; }} style={{ padding: '6px 12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: 'white', cursor: 'pointer', fontSize: 13, borderRadius: 6 }}>🚪 Salir</button>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px' }}>
        {/* SELECTOR FECHA */}
        <div style={{ background: 'white', borderRadius: 10, padding: 16, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#555' }}>📅 Selecciona fecha:</label>
          <input 
            type="date" 
            value={fecha} 
            onChange={(e) => setFecha(e.target.value)}
            style={{ padding: '10px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, width: '100%', maxWidth: 300, boxSizing: 'border-box' }}
          />
        </div>

        {/* CONTENIDO */}
        {cargando ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Cargando guardias...</div>
        ) : esFinDeSemana ? (
          <div style={{ background: 'white', borderRadius: 10, padding: 40, textAlign: 'center', color: '#888' }}>
            🏖️ Fin de semana — no hay guardias programadas
          </div>
        ) : sectores.length === 0 ? (
          <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 10, padding: 16, color: '#92400e', fontSize: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>⚠️ No hay cuadrante cargado</div>
            <div>Ve a <strong>Gestión → Datos del Centro → Guardias</strong> y sube los archivos HTM de Delphos.</div>
          </div>
        ) : (
          <div style={{ background: 'white', borderRadius: 10, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', overflowX: 'auto' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: '#1e3a5f' }}>
              📊 {diaSem.charAt(0).toUpperCase() + diaSem.slice(1)} {new Date(fecha+'T12:00:00').toLocaleDateString('es-ES', {day: 'numeric', month: 'long'})}
            </div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
              ✅ {sectores.length} sectores · {Object.values(guardias).reduce((sum, s) => sum + Object.values(s[diaSem] || {}).reduce((s2, h) => s2 + h.length, 0), 0)} guardias hoy
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f0f0f0', borderBottom: '2px solid #ddd' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 700, color: '#1e3a5f', minWidth: 120 }}>Sector</th>
                  {HORAS.map(h => (
                    <th key={h} style={{ textAlign: 'center', padding: '10px 8px', fontWeight: 700, color: '#1e3a5f', minWidth: 70 }}>
                      {h}ª<br/><span style={{ fontSize: 10, fontWeight: 400, color: '#888' }}>8:30+{h}h</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sectores.map((sector, idx) => (
                  <tr key={sector} style={{ borderBottom: '1px solid #eee', background: idx % 2 === 0 ? 'white' : '#f9f9f9' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#333' }}>{sector}</td>
                    {HORAS.map(hora => {
                      const profs = guardias[sector]?.[diaSem]?.[hora] || [];
                      return (
                        <td key={hora} style={{ padding: '8px', textAlign: 'center', verticalAlign: 'top' }}>
                          {profs.map((p, j) => {
                            const nombreCompleto = mapaProfesores[normAbrev(p)] || p;
                            return (
                              <div key={j} style={{ 
                                fontSize: 10, 
                                color: '#1e3a5f', 
                                background: '#e0e7ff', 
                                padding: '4px 6px', 
                                borderRadius: 4, 
                                marginBottom: 2,
                                whiteSpace: 'nowrap'
                              }}>
                                {nombreCompleto}
                              </div>
                            );
                          })}
                          {profs.length === 0 && <div style={{ fontSize: 10, color: '#ccc' }}>—</div>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
