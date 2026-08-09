'use client';
// v20260801_135812
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';

const azul = '#1e3a5f';
const verde = '#1e6b2e';
const rojo = '#b91c1c';
const naranja = '#c2410c';

const PROFESORES_DEMO = [
  { email: 'ana.martinez.test@educastillalamancha.es', nombre: 'Ana Martinez Ruiz', dept: 'TMV/Carrocería', rol: 'profesor', emoji: '🚗' },
  { email: 'carlos.lopez.test@educastillalamancha.es', nombre: 'Carlos Lopez Fernandez', dept: 'Comercio', rol: 'profesor', emoji: '🛍️' },
  { email: 'maria.garcia.test@educastillalamancha.es', nombre: 'Maria Garcia Sanchez', dept: 'Informática', rol: 'profesor', emoji: '💻' },
  { email: 'pedro.rodriguez.test@educastillalamancha.es', nombre: 'Pedro Rodriguez Diaz', dept: 'Electricidad', rol: 'profesor', emoji: '⚡' },
  { email: 'laura.sanchez.test@educastillalamancha.es', nombre: 'Laura Sanchez Moreno', dept: 'Hostelería', rol: 'profesor', emoji: '🍽️' },
  { email: 'javier.perez.test@educastillalamancha.es', nombre: 'Javier Perez Gonzalez', dept: 'Industrias Alimentarias', rol: 'profesor', emoji: '🥖' },
  { email: 'elena.jimenez.test@educastillalamancha.es', nombre: 'Elena Jimenez Torres', dept: 'Administración', rol: 'profesor', emoji: '🏢' },
  { email: 'miguel.hernandez.test@educastillalamancha.es', nombre: 'Miguel Hernandez Romero', dept: 'FOL', rol: 'profesor', emoji: '📚' },
  { email: 'sofia.navarro.test@educastillalamancha.es', nombre: 'Sofia Navarro Castillo', dept: 'Matemáticas', rol: 'profesor', emoji: '🌐' },
  { email: 'antonio.ruiz.test@educastillalamancha.es', nombre: 'Antonio Ruiz Vega', dept: 'Lengua y Literatura', rol: 'profesor', emoji: '🌐' },
  { email: 'director@iesgregorioprieto.es', nombre: 'Director — José María Díaz', dept: 'Dirección', rol: 'director', emoji: '👑' },
  { email: 'llcc12@educastillalamancha.es', nombre: 'Luis Javier Cárdenas (Secretario)', dept: 'TMV/Carrocería', rol: 'secretario', emoji: '⚙️' },
];

export default function Demo() {
  const [cargando, setCargando] = useState(false);
  const [limpiando, setLimpiando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [confirmLimpiar, setConfirmLimpiar] = useState(false);
  const [autorizado, setAutorizado] = useState(null); // null = comprobando

  // Esta pantalla permite entrar como cualquier profesor, así que solo
  // puede usarla el equipo directivo.
  useEffect(() => {
    const id  = sessionStorage.getItem('profesor_id');
    const rol = sessionStorage.getItem('profesor_rol_gestion');
    const ok  = !!id && ['director', 'secretario', 'jefe_estudios'].includes(rol);
    setAutorizado(ok);
    if (!ok) {
      // Guardamos de dónde venía para no dejarle en blanco
      window.location.href = '/login';
    }
  }, []);

  async function entrarComo(prof) {
    setCargando(prof.email);
    try {
      const rows = await getSupabase()
        .from('profesores')
        .select('id, nombre, apellidos, rol, rol_gestion, estado')
        .eq('email', prof.email);

      const p = rows.data?.[0];
      if (!p) {
        setMensaje({ tipo: 'error', texto: `No se encontró el usuario ${prof.email} en la BD` });
        setCargando(false);
        return;
      }

      // Guardar sesión igual que hace el login real
      sessionStorage.setItem('profesor_id', p.id);
      sessionStorage.setItem('profesor_nombre', `${p.nombre} ${p.apellidos}`);
      sessionStorage.setItem('profesor_rol_gestion', p.rol_gestion || '');
      sessionStorage.setItem('profesor_roles', JSON.stringify(Array.isArray(p.rol) ? p.rol : ['profesor']));

      // Redirigir según rol
      if (['director', 'secretario', 'jefe_estudios'].includes(p.rol_gestion)) {
        window.location.href = '/gestion';
      } else {
        window.location.href = '/profesor';
      }
    } catch(e) {
      setMensaje({ tipo: 'error', texto: 'Error: ' + e.message });
      setCargando(false);
    }
  }

  async function limpiarDatos() {
    setLimpiando(true);
    setConfirmLimpiar(false);
    try {
      const supabase = getSupabase();
      
      // Obtener IDs de profesores test
      const { data: profTest } = await supabase
        .from('profesores')
        .select('id')
        .like('email', '%test%');
      
      const ids = (profTest || []).map(p => p.id);

      let errores = [];

      if (ids.length > 0) {
        // Borrar datos relacionados con los profesores test
        const tablas = ['ausencias', 'dld', 'apoyos_asignados', 'compras', 'horarios_profesores'];
        for (const tabla of tablas) {
          const { error } = await supabase.from(tabla).delete().in('profesor_id', ids);
          if (error) errores.push(tabla);
        }
        // Borrar los profesores test
        await supabase.from('profesores').delete().like('email', '%test%');
      }

      // Borrar ausencias y DLD creados en modo demo (por cualquier usuario)
      // Solo los del curso actual con motivo "demo" o fecha reciente
      // Para no borrar datos reales, solo borramos los de los profesores test
      
      if (errores.length > 0) {
        setMensaje({ tipo: 'aviso', texto: `✅ Limpieza completada con avisos en: ${errores.join(', ')}` });
      } else {
        setMensaje({ tipo: 'ok', texto: '✅ Todos los datos de prueba eliminados. La app queda limpia.' });
      }
    } catch(e) {
      setMensaje({ tipo: 'error', texto: 'Error limpiando: ' + e.message });
    }
    setLimpiando(false);
  }

  const profes = PROFESORES_DEMO.filter(p => !['director', 'secretario'].some(r => p.rol === r || p.email.includes('director') || p.email.includes('llcc12')));
  const directivos = PROFESORES_DEMO.filter(p => p.rol === 'director' || p.rol === 'secretario' || p.email.includes('director') || p.email.includes('llcc12'));

  if (autorizado !== true) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', color: '#888', backgroundColor: '#f0f4f0' }}>
        Comprobando permisos...
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', fontFamily: 'system-ui, sans-serif', padding: '24px 16px' }}>
      
      {/* HEADER */}
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🧪</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'white', marginBottom: 4 }}>
            Modo Demo — IES Gregorio Prieto
          </div>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>
            Selecciona un usuario para entrar sin contraseña
          </div>
          <a href="/" style={{ display: 'inline-block', marginTop: 10, fontSize: 12, color: '#64748b', textDecoration: 'none' }}>
            ← Volver a la home
          </a>
        </div>

        {/* MENSAJE */}
        {mensaje && (
          <div style={{
            marginBottom: 16, padding: '12px 16px', borderRadius: 10,
            backgroundColor: mensaje.tipo === 'error' ? '#fef2f2' : mensaje.tipo === 'aviso' ? '#fffbeb' : '#dcfce7',
            color: mensaje.tipo === 'error' ? rojo : mensaje.tipo === 'aviso' ? '#78350f' : verde,
            fontWeight: 600, fontSize: 13,
          }}>
            {mensaje.texto}
            <button onClick={() => setMensaje(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#888' }}>✕</button>
          </div>
        )}

        {/* DIRECTIVOS */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
            👑 Equipo Directivo
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {PROFESORES_DEMO.filter(p => p.email.includes('director') || p.email.includes('llcc12')).map(p => (
              <button
                key={p.email}
                onClick={() => entrarComo(p)}
                disabled={cargando === p.email}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                  borderRadius: 12, border: '1.5px solid #334155', cursor: 'pointer',
                  backgroundColor: cargando === p.email ? '#1e293b' : '#1e293b',
                  textAlign: 'left', transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: 24 }}>{p.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#f1f5f9' }}>{p.nombre}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{p.dept}</div>
                </div>
                <span style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 700,
                  backgroundColor: p.rol === 'director' ? '#7c3aed' : '#0891b2',
                  color: 'white',
                }}>
                  {p.rol === 'director' ? 'Director' : 'Secretario'}
                </span>
                {cargando === p.email && <span style={{ color: '#94a3b8', fontSize: 12 }}>⏳</span>}
              </button>
            ))}
          </div>
        </div>

        {/* PROFESORES */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
            👨‍🏫 Profesores de prueba
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {PROFESORES_DEMO.filter(p => !p.email.includes('director') && !p.email.includes('llcc12')).map(p => (
              <button
                key={p.email}
                onClick={() => entrarComo(p)}
                disabled={!!cargando}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
                  borderRadius: 12, border: '1.5px solid #1e293b', cursor: 'pointer',
                  backgroundColor: cargando === p.email ? '#1e3a5f' : '#0f172a',
                  textAlign: 'left', transition: 'all 0.15s',
                  opacity: cargando && cargando !== p.email ? 0.5 : 1,
                }}
              >
                <span style={{ fontSize: 20 }}>{p.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#e2e8f0' }}>{p.nombre}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{p.dept}</div>
                </div>
                {cargando === p.email
                  ? <span style={{ color: '#94a3b8', fontSize: 12 }}>⏳ Entrando...</span>
                  : <span style={{ fontSize: 11, color: '#475569' }}>→</span>
                }
              </button>
            ))}
          </div>
        </div>

        {/* LIMPIAR DATOS */}
        <div style={{ borderTop: '1px solid #1e293b', paddingTop: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            🗑️ Limpiar datos de prueba
          </div>
          
          {!confirmLimpiar ? (
            <button
              onClick={() => setConfirmLimpiar(true)}
              style={{
                width: '100%', padding: '12px', borderRadius: 10, border: '1.5px solid #dc2626',
                backgroundColor: 'transparent', color: '#dc2626', fontWeight: 700, fontSize: 14, cursor: 'pointer',
              }}
            >
              🗑️ Eliminar todos los datos de prueba
            </button>
          ) : (
            <div style={{ backgroundColor: '#1e293b', borderRadius: 12, padding: 16, border: '1.5px solid #dc2626' }}>
              <div style={{ color: '#fca5a5', fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                ⚠️ ¿Seguro que quieres eliminar todos los datos de prueba?
              </div>
              <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
                Se eliminarán los 10 profesores de prueba y todos sus registros asociados (ausencias, DLDs, apoyos...). Los datos reales no se tocan.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={limpiarDatos}
                  disabled={limpiando}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 8, border: 'none',
                    backgroundColor: '#dc2626', color: 'white', fontWeight: 800, fontSize: 14, cursor: 'pointer',
                  }}
                >
                  {limpiando ? '⏳ Limpiando...' : '✅ Sí, eliminar todo'}
                </button>
                <button
                  onClick={() => setConfirmLimpiar(false)}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 8, border: '1.5px solid #334155',
                    backgroundColor: 'transparent', color: '#94a3b8', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 16, fontSize: 11, color: '#475569', textAlign: 'center', lineHeight: 1.6 }}>
            Esta pantalla es solo para pruebas internas.<br/>
            No compartir con el profesorado.
          </div>
        </div>
      </div>
    </div>
  );
}
