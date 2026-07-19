'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';

export default function PanelProfesor() {
  const [nombre, setNombre] = useState('');
  const [roles, setRoles] = useState(['profesor']);
  const [rolGestion, setRolGestion] = useState('');
  const [apoyosPendientes, setApoyosPendientes] = useState([]);
  const [profId, setProfId] = useState('');

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    const nombreGuardado = sessionStorage.getItem('profesor_nombre');
    const rolGestionGuardado = sessionStorage.getItem('profesor_rol_gestion');
    const rolesGuardados = sessionStorage.getItem('profesor_roles');

    if (!id) {
      window.location.href = '/login';
      return;
    }

    setProfId(id);
    setNombre(nombreGuardado || '');
    setRolGestion(rolGestionGuardado || '');
    setRoles(rolesGuardados ? JSON.parse(rolesGuardados) : ['profesor']);
    
    cargarApoyosPendientes(id);
  }, []);
  
  async function cargarApoyosPendientes(id) {
    // Buscar apoyos pendientes de HOY y siguientes días (hasta 7)
    const hoy = new Date().toISOString().split('T')[0];
    const dentroDe7 = new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0];
    const { data } = await getSupabase()
      .from('apoyos_asignados')
      .select('*')
      .eq('profesor_id', id)
      .eq('estado', 'pendiente')
      .gte('fecha', hoy)
      .lte('fecha', dentroDe7)
      .order('fecha', { ascending: true });
    setApoyosPendientes(data || []);
  }
  
  async function confirmarApoyo(apoyoId) {
    const { error } = await getSupabase()
      .from('apoyos_asignados')
      .update({ estado: 'confirmado', confirmado_at: new Date().toISOString() })
      .eq('id', apoyoId);
    if (error) { alert('Error confirmando: ' + error.message); return; }
    cargarApoyosPendientes(profId);
  }

  function cerrarSesion() {
    sessionStorage.clear();
    window.location.href = '/login';
  }

  async function forzarActualizacion() {
    try {
      // 1. Desregistrar todos los Service Workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
      }
      // 2. Borrar todas las caches
      if ('caches' in window) {
        const nombres = await caches.keys();
        await Promise.all(nombres.map(n => caches.delete(n)));
      }
      // 3. Recargar sin caché
      window.location.reload(true);
    } catch (e) {
      // Si algo falla, al menos recargar
      window.location.reload();
    }
  }

  const verde = '#1e6b2e';

  const MODULOS = [
    {
      id: 'guardias',
      emoji: '🛡️',
      titulo: 'Guardias',
      descripcion: 'Consulta las guardias y ausencias del día',
      href: '/guardias',
      disponible: true,
      roles: ['todos'],
      color: '#7c2d12', bg: '#fff7ed', border: '#fdba74',
    },
    {
      id: 'ausencias',
      emoji: '🏥',
      titulo: 'Notifica una Ausencia',
      descripcion: 'Notifica tu ausencia e indica las tareas para tus grupos',
      href: '/ausencias',
      disponible: true,
      roles: ['todos'],
      color: '#b91c1c', bg: '#fef2f2', border: '#fca5a5',
    },
    {
      id: 'dld',
      emoji: '📄',
      titulo: 'Días Libre Disposición',
      descripcion: 'Solicita tus días de libre disposición',
      href: '/dld',
      disponible: true,
      roles: ['todos'],
      color: '#1d4ed8', bg: '#eff6ff', border: '#93c5fd',
    },
    {
      id: 'autorizaciones',
      emoji: '📋',
      titulo: 'Autorizaciones',
      descripcion: 'Consulta autorizaciones y restricciones del alumnado',
      href: '/autorizaciones',
      hrefTutor: '/autorizaciones/gestion',
      disponible: true,
      roles: ['todos'],
      color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd',
    },
    {
      id: 'mantenimiento',
      emoji: '🔧',
      titulo: 'Mantenimiento',
      descripcion: 'Notifica desperfectos e incidencias del centro',
      href: '/mantenimiento',
      disponible: true,
      roles: ['todos'],
      color: '#b45309', bg: '#fffbeb', border: '#fcd34d',
    },
    {
      id: 'compras',
      emoji: '🛒',
      titulo: 'Solicitud de Compras',
      descripcion: 'Solicita material o registra compras para tu departamento',
      href: '/compras',
      disponible: true,
      roles: ['todos'],
      soloJefeDepartamento: true,
      color: '#0f766e', bg: '#f0fdfa', border: '#5eead4',
    },
    {
      id: 'tutorias',
      emoji: '🤝',
      titulo: 'Tutorías',
      descripcion: 'Gestión de tu grupo de tutoría',
      href: '/tutorias',
      disponible: false,
      roles: ['tutor'],
      color: '#475569', bg: '#f8fafc', border: '#cbd5e1',
    },
  ];

  const PANELES_DIRECTIVOS = [
    { rol: 'secretario', emoji: '⚙️', titulo: 'Panel de Gestión', href: '/gestion' },
    { rol: 'director', emoji: '⚙️', titulo: 'Panel de Gestión', href: '/gestion' },
    { rol: 'jefe_estudios', emoji: '⚙️', titulo: 'Panel de Gestión', href: '/gestion' },
  ];

  const panelDirectivo = PANELES_DIRECTIVOS.find(p => p.rol === rolGestion);

  // Tutores también tienen acceso a gestión de autorizaciones
  const esTutor = roles.includes('tutor');
  const panelTutor = esTutor && !panelDirectivo
    ? { emoji: '📋', titulo: 'Mis Autorizaciones', href: '/autorizaciones/gestion' }
    : null;

  const esDirector = rolGestion === 'director';

  const modulosVisibles = MODULOS.filter(m =>
    esDirector || m.roles.includes('todos') || m.roles.some(r => roles.includes(r)) || m.roles.includes(rolGestion)
  );

  function tieneAcceso(m) {
    if (esDirector) return true;
    if (m.soloJefeDepartamento) {
      return roles.includes('jefe_departamento') || ['secretario', 'director', 'jefe_estudios'].includes(rolGestion);
    }
    if (!m.restringido) return true;
    return m.restringido.some(r => roles.includes(r) || r === rolGestion);
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      {/* HEADER */}
      <div style={{ backgroundColor: verde, color: 'white', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>🏫 IES Gregorio Prieto</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>Hola, {nombre}</div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {(panelDirectivo || panelTutor) && (
            <a href={(panelDirectivo || panelTutor).href} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8,
              border: '1.5px solid rgba(255,255,255,0.5)',
              backgroundColor: 'rgba(255,255,255,0.15)',
              color: 'white', textDecoration: 'none',
              fontSize: 13, fontWeight: 600
            }}>
              🔐 {(panelDirectivo || panelTutor).titulo}
            </a>
          )}
          <button onClick={forzarActualizacion} style={{
            padding: '7px 12px', borderRadius: 8,
            border: '1.5px solid rgba(255,255,255,0.4)',
            backgroundColor: 'transparent', color: 'white',
            cursor: 'pointer', fontSize: 13,
          }} title="Fuerza descargar la última versión">🔄</button>
          <button onClick={cerrarSesion} style={{
            padding: '7px 14px', borderRadius: 8,
            border: '1.5px solid rgba(255,255,255,0.4)',
            backgroundColor: 'transparent', color: 'white',
            cursor: 'pointer', fontSize: 13
          }}>🚪 Salir</button>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 16px' }}>

        {/* BANNER DE APOYOS PENDIENTES - LLAMATIVO */}
        {apoyosPendientes.length > 0 && (
          <div style={{ 
            backgroundColor: '#fef3c7', 
            border: '3px solid #f59e0b',
            borderRadius: 14, 
            padding: 20, 
            marginBottom: 20, 
            boxShadow: '0 4px 20px rgba(245, 158, 11, 0.3)',
            animation: 'pulse 2s ease-in-out infinite'
          }}>
            <style>{`
              @keyframes pulse {
                0%, 100% { box-shadow: 0 4px 20px rgba(245, 158, 11, 0.3); }
                50% { box-shadow: 0 4px 30px rgba(245, 158, 11, 0.6); }
              }
            `}</style>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
              <span style={{ fontSize:28 }}>🚨</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:16, fontWeight:800, color:'#78350f' }}>APOYO ASIGNADO</div>
                <div style={{ fontSize:12, color:'#92400e' }}>Debes cubrir {apoyosPendientes.length === 1 ? 'este grupo' : `estos ${apoyosPendientes.length} grupos`}</div>
              </div>
            </div>
            {apoyosPendientes.map(ap => (
              <div key={ap.id} style={{ 
                backgroundColor:'white', 
                borderRadius:10, 
                padding:14, 
                marginBottom:8,
                border:'1.5px solid #fbbf24'
              }}>
                <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8 }}>
                  <span style={{ 
                    backgroundColor:'#f59e0b', color:'white', 
                    padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:800
                  }}>
                    📅 {new Date(ap.fecha+'T12:00:00').toLocaleDateString('es-ES', {weekday:'long', day:'numeric', month:'long'})}
                  </span>
                  <span style={{ 
                    backgroundColor:'#78350f', color:'white', 
                    padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:800
                  }}>
                    ⏰ {ap.hora}ª hora
                  </span>
                </div>
                <div style={{ fontSize:14, color:'#78350f', marginBottom:6 }}>
                  <strong>👥 Grupo:</strong> {ap.grupo || '—'}
                </div>
                {ap.materia && (
                  <div style={{ fontSize:13, color:'#92400e', marginBottom:4 }}>
                    <strong>📚 Materia:</strong> {ap.materia}
                  </div>
                )}
                {ap.aula && (
                  <div style={{ fontSize:13, color:'#92400e', marginBottom:4 }}>
                    <strong>📍 Aula:</strong> {ap.aula}
                  </div>
                )}
                {ap.tarea && (
                  <div style={{ 
                    marginTop:8, padding:10, backgroundColor:'#fffbeb', 
                    borderRadius:8, fontSize:12, color:'#78350f',
                    border:'1px solid #fde68a'
                  }}>
                    <strong>📝 Tarea para los alumnos:</strong><br/>{ap.tarea}
                  </div>
                )}
                <button 
                  onClick={()=>confirmarApoyo(ap.id)}
                  style={{
                    marginTop:12, padding:'10px 20px', width:'100%',
                    backgroundColor:'#059669', color:'white', 
                    border:'none', borderRadius:10, cursor:'pointer',
                    fontSize:14, fontWeight:800, boxShadow:'0 2px 8px rgba(5, 150, 105, 0.3)'
                  }}
                >
                  ✅ CONFIRMAR QUE LO CUBRO
                </button>
              </div>
            ))}
          </div>
        )}

        {/* BIENVENIDA */}
        <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 24, marginBottom: 24, boxShadow: '0 2px 10px rgba(0,0,0,0.07)', borderLeft: `5px solid ${verde}` }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: verde, marginBottom: 4 }}>
            👋 Bienvenido/a, {nombre.split(' ')[0]}
          </div>
          <div style={{ fontSize: 14, color: '#666' }}>
            Portal de gestión · IES Gregorio Prieto · Valdepeñas
          </div>
          {rolGestion && (
            <div style={{ marginTop: 10, fontSize: 13, backgroundColor: '#e8f5e9', color: verde, padding: '4px 12px', borderRadius: 20, display: 'inline-block', fontWeight: 600 }}>
              {rolGestion === 'director' ? '👔 Director/a' :
               rolGestion === 'jefe_estudios' ? '📋 Jefe/a de Estudios' :
               rolGestion === 'secretario' ? '📁 Secretario/a' : ''}
            </div>
          )}
        </div>

        {/* MÓDULOS */}
        <div style={{ fontSize: 13, fontWeight: 700, color: '#888', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
          Módulos disponibles
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
          {modulosVisibles.map(m => {
            const acceso = tieneAcceso(m);
            const colorActivo = m.color || verde;
            const bgActivo = m.bg || '#f0fdf4';
            const borderActivo = m.border || '#a7f3d0';
            return (
            <div
              key={m.id}
              onClick={() => m.disponible && acceso && (window.location.href = (m.hrefTutor && esTutor) ? m.hrefTutor : m.href)}
              style={{
                backgroundColor: m.disponible && acceso ? bgActivo : '#fafafa',
                borderRadius: 14, padding: 20,
                boxShadow: m.disponible && acceso ? `0 3px 12px ${borderActivo}60` : '0 1px 4px rgba(0,0,0,0.06)',
                cursor: m.disponible && acceso ? 'pointer' : 'default',
                opacity: m.disponible ? 1 : 0.55,
                border: `2px solid ${m.disponible && acceso ? borderActivo : '#e5e7eb'}`,
                transition: 'all 0.15s',
                position: 'relative',
              }}
            >
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                backgroundColor: m.disponible && acceso ? `${borderActivo}50` : '#f0f0f0',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 26, marginBottom: 12,
              }}>{m.emoji}</div>
              <div style={{ fontWeight: 800, fontSize: 15, color: m.disponible && acceso ? colorActivo : '#aaa', marginBottom: 4 }}>
                {m.titulo}
              </div>
              <div style={{ fontSize: 12, color: m.disponible && acceso ? `${colorActivo}99` : '#ccc', lineHeight: 1.4 }}>
                {m.hrefTutor && esTutor ? 'Gestiona las autorizaciones y restricciones de tu grupo' : m.descripcion}
              </div>
              {!m.disponible && (
                <div style={{
                  position: 'absolute', top: 12, right: 12,
                  fontSize: 11, backgroundColor: '#f0f0f0', color: '#999',
                  padding: '2px 8px', borderRadius: 10, fontWeight: 600
                }}>Próximo</div>
              )}
              {m.disponible && !tieneAcceso(m) && (
                <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span style={{ fontSize: 16 }}>🔒</span>
                  <span style={{ fontSize: 10, backgroundColor: '#f3f4f6', color: '#999', padding: '2px 7px', borderRadius: 8, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {m.soloJefeDepartamento ? 'Solo Jefes Dpto.' : 'Sin acceso'}
                  </span>
                </div>
              )}
              {m.disponible && acceso && (
                <div style={{ marginTop: 12, fontSize: 12, color: colorActivo, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  Acceder →
                  {m.hrefTutor && esTutor && (
                    <span style={{ fontSize: 10, backgroundColor: `${borderActivo}60`, color: colorActivo, padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>Tutor</span>
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}