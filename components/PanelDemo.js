'use client';

import { useState } from 'react';
import { getSupabase } from '@/lib/supabase';

const PROFESORES_DEMO = [
  { email: 'ana.martinez.test@educastillalamancha.es',      nombre: 'Ana Martinez Ruiz',        dept: 'TMV/Carrocería',           emoji: '🚗' },
  { email: 'carlos.lopez.test@educastillalamancha.es',      nombre: 'Carlos Lopez Fernandez',   dept: 'Comercio',                 emoji: '🛍️' },
  { email: 'maria.garcia.test@educastillalamancha.es',      nombre: 'Maria Garcia Sanchez',     dept: 'Informática',              emoji: '💻' },
  { email: 'pedro.rodriguez.test@educastillalamancha.es',   nombre: 'Pedro Rodriguez Diaz',     dept: 'Electricidad',             emoji: '⚡' },
  { email: 'laura.sanchez.test@educastillalamancha.es',     nombre: 'Laura Sanchez Moreno',     dept: 'Hostelería',               emoji: '🍽️' },
  { email: 'javier.perez.test@educastillalamancha.es',      nombre: 'Javier Perez Gonzalez',    dept: 'Industrias Alimentarias',  emoji: '🥖' },
  { email: 'elena.jimenez.test@educastillalamancha.es',     nombre: 'Elena Jimenez Torres',     dept: 'Administración',           emoji: '🏢' },
  { email: 'miguel.hernandez.test@educastillalamancha.es',  nombre: 'Miguel Hernandez Romero',  dept: 'FOL',                      emoji: '📚' },
  { email: 'sofia.navarro.test@educastillalamancha.es',     nombre: 'Sofia Navarro Castillo',   dept: 'Matemáticas',              emoji: '🌐' },
  { email: 'antonio.ruiz.test@educastillalamancha.es',      nombre: 'Antonio Ruiz Vega',        dept: 'Lengua y Literatura',      emoji: '📝' },
];

export default function PanelDemo() {
  const [abierto, setAbierto]     = useState(false);
  const [msg, setMsg]             = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [limpiando, setLimpiando] = useState(false);

  async function entrarComo(prof) {
    const { data } = await getSupabase()
      .from('profesores')
      .select('id,nombre,apellidos,rol,rol_gestion,estado')
      .eq('email', prof.email);

    const p = data?.[0];
    if (!p) { setMsg('No encontrado en la base de datos: ' + prof.email); return; }

    sessionStorage.setItem('profesor_id', p.id);
    sessionStorage.setItem('profesor_nombre', p.nombre + ' ' + p.apellidos);
    sessionStorage.setItem('profesor_email', prof.email);
    sessionStorage.setItem('profesor_rol_gestion', p.rol_gestion || '');
    sessionStorage.setItem('profesor_roles', JSON.stringify(Array.isArray(p.rol) ? p.rol : ['profesor']));

    window.location.href = '/profesor';
  }

  async function limpiar() {
    setLimpiando(true);
    setConfirmar(false);
    const supabase = getSupabase();

    const { data: profs } = await supabase.from('profesores').select('id').like('email', '%test%');
    const ids = (profs || []).map(p => p.id);

    if (ids.length > 0) {
      for (const tabla of ['ausencias', 'dld', 'apoyos_asignados', 'compras', 'horarios_profesores']) {
        await supabase.from(tabla).delete().in('profesor_id', ids);
      }
      await supabase.from('profesores').delete().like('email', '%test%');
    }

    setMsg('✅ Datos de prueba eliminados. La aplicación queda limpia.');
    setLimpiando(false);
  }

  return (
    <div style={{ marginTop: 26, borderTop: '2px dashed #e5e7eb', paddingTop: 18 }}>
      <button
        onClick={() => { setAbierto(!abierto); setMsg(''); setConfirmar(false); }}
        style={{
          width: '100%', padding: '11px', borderRadius: 10,
          border: '1.5px dashed #9ca3af',
          backgroundColor: abierto ? '#1e293b' : 'white',
          color: abierto ? 'white' : '#6b7280',
          fontWeight: 700, fontSize: 13, cursor: 'pointer',
        }}
      >
        🧪 {abierto ? 'Cerrar panel de pruebas' : 'Panel de pruebas internas (demo)'}
      </button>

      {abierto && (
        <div style={{ marginTop: 12, backgroundColor: '#0f172a', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12, textAlign: 'center', lineHeight: 1.5 }}>
            Entra como cualquier profesor de prueba para comprobar cómo ve la aplicación.<br />
            <span style={{ color: '#64748b', fontSize: 11 }}>
              Al terminar, cierra sesión y vuelve a entrar con tu cuenta.
            </span>
          </div>

          {msg && (
            <div style={{
              backgroundColor: msg.startsWith('✅') ? '#dcfce7' : '#fef2f2',
              borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12,
              color: msg.startsWith('✅') ? '#166534' : '#b91c1c', fontWeight: 600,
            }}>
              {msg}
              <button onClick={() => setMsg('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#888' }}>✕</button>
            </div>
          )}

          <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            👨‍🏫 Profesores de prueba
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
            {PROFESORES_DEMO.map(p => (
              <button key={p.email} onClick={() => entrarComo(p)} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                borderRadius: 8, border: '1px solid #1e293b', backgroundColor: '#0f172a',
                cursor: 'pointer', textAlign: 'left',
              }}>
                <span style={{ fontSize: 16 }}>{p.emoji}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.nombre.split(' ')[0]} {p.nombre.split(' ')[1]}
                  </div>
                  <div style={{ fontSize: 10, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.dept}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div style={{ borderTop: '1px solid #1e293b', paddingTop: 12 }}>
            {!confirmar ? (
              <button onClick={() => setConfirmar(true)} style={{
                width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #dc2626',
                backgroundColor: 'transparent', color: '#dc2626', fontWeight: 700, fontSize: 12, cursor: 'pointer',
              }}>
                🗑️ Eliminar todos los datos de prueba
              </button>
            ) : (
              <div>
                <div style={{ fontSize: 11, color: '#fca5a5', marginBottom: 8, textAlign: 'center', lineHeight: 1.5 }}>
                  Se eliminarán los profesores de prueba y todos sus datos.<br />
                  Los profesores reales no se tocan.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={limpiar} disabled={limpiando} style={{
                    flex: 1, padding: '8px', borderRadius: 6, border: 'none',
                    backgroundColor: '#dc2626', color: 'white', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                  }}>
                    {limpiando ? '⏳ Limpiando...' : '✅ Sí, eliminar todo'}
                  </button>
                  <button onClick={() => setConfirmar(false)} style={{
                    flex: 1, padding: '8px', borderRadius: 6, border: '1px solid #334155',
                    backgroundColor: 'transparent', color: '#94a3b8', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                  }}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
