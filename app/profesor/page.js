'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';

export default function PanelProfesor() {
  const [nombre, setNombre] = useState('');
  const [roles, setRoles] = useState(['profesor']);
  const [rolGestion, setRolGestion] = useState('');

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    const nombreGuardado = sessionStorage.getItem('profesor_nombre');
    const rolGestionGuardado = sessionStorage.getItem('profesor_rol_gestion');
    const rolesGuardados = sessionStorage.getItem('profesor_roles');

    if (!id) {
      window.location.href = '/login';
      return;
    }

    setNombre(nombreGuardado || '');
    setRolGestion(rolGestionGuardado || '');
    setRoles(rolesGuardados ? JSON.parse(rolesGuardados) : ['profesor']);
  }, []);

  function cerrarSesion() {
    sessionStorage.clear();
    window.location.href = '/login';
  }

  const verde = '#1e6b2e';

  const MODULOS = [
    {
      id: 'mantenimiento',
      emoji: '🔧',
      titulo: 'Mantenimiento',
      descripcion: 'Notifica desperfectos e incidencias del centro',
      href: '/mantenimiento',
      disponible: true,
      roles: ['todos'],
    },
    {
      id: 'dld',
      emoji: '📄',
      titulo: 'Días Libre Disposición',
      descripcion: 'Solicita tus días de libre disposición',
      href: '/dld',
      disponible: true,
      roles: ['todos'],
    },
    {
      id: 'guardias',
      emoji: '📅',
      titulo: 'Guardias',
      descripcion: 'Consulta tus guardias asignadas',
      href: '/guardias',
      disponible: false,
      roles: ['todos'],
    },
    {
      id: 'noticias',
      emoji: '📢',
      titulo: 'Noticias',
      descripcion: 'Novedades y comunicados del centro',
      href: '/noticias',
      disponible: false,
      roles: ['todos'],
    },
    {
      id: 'departamento',
      emoji: '📂',
      titulo: 'Mi Departamento',
      descripcion: 'Gestión del departamento',
      href: '/departamento',
      disponible: false,
      roles: ['jefe_departamento'],
    },
    {
      id: 'tutorias',
      emoji: '🤝',
      titulo: 'Tutorías',
      descripcion: 'Gestión de tu grupo de tutoría',
      href: '/tutorias',
      disponible: false,
      roles: ['tutor'],
    },
  ];

  const PANELES_DIRECTIVOS = [
    { rol: 'secretario', emoji: '📁', titulo: 'Panel Secretaría', href: '/secretario' },
    { rol: 'director', emoji: '👔', titulo: 'Panel Dirección', href: '/director' },
    { rol: 'jefe_estudios', emoji: '📋', titulo: 'Panel Jefatura', href: '/jefe-estudios' },
  ];

  const panelDirectivo = PANELES_DIRECTIVOS.find(p => p.rol === rolGestion);

  const modulosVisibles = MODULOS.filter(m =>
    m.roles.includes('todos') || m.roles.some(r => roles.includes(r))
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      {/* HEADER */}
      <div style={{ backgroundColor: verde, color: 'white', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>🏫 IES Gregorio Prieto</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>Hola, {nombre}</div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {panelDirectivo && (
            <a href={panelDirectivo.href} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8,
              border: '1.5px solid rgba(255,255,255,0.5)',
              backgroundColor: 'rgba(255,255,255,0.15)',
              color: 'white', textDecoration: 'none',
              fontSize: 13, fontWeight: 600
            }}>
              🔐 {panelDirectivo.titulo}
            </a>
          )}
          <button onClick={cerrarSesion} style={{
            padding: '7px 14px', borderRadius: 8,
            border: '1.5px solid rgba(255,255,255,0.4)',
            backgroundColor: 'transparent', color: 'white',
            cursor: 'pointer', fontSize: 13
          }}>🚪 Salir</button>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 16px' }}>

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
          {modulosVisibles.map(m => (
            <div
              key={m.id}
              onClick={() => m.disponible && (window.location.href = m.href)}
              style={{
                backgroundColor: 'white', borderRadius: 14, padding: 20,
                boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
                cursor: m.disponible ? 'pointer' : 'default',
                opacity: m.disponible ? 1 : 0.6,
                border: `2px solid ${m.disponible ? 'transparent' : '#eee'}`,
                transition: 'all 0.15s',
                position: 'relative',
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 10 }}>{m.emoji}</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: m.disponible ? verde : '#aaa', marginBottom: 4 }}>
                {m.titulo}
              </div>
              <div style={{ fontSize: 13, color: '#888', lineHeight: 1.4 }}>
                {m.descripcion}
              </div>
              {!m.disponible && (
                <div style={{
                  position: 'absolute', top: 12, right: 12,
                  fontSize: 11, backgroundColor: '#f0f0f0', color: '#999',
                  padding: '2px 8px', borderRadius: 10, fontWeight: 600
                }}>Próximo</div>
              )}
              {m.disponible && (
                <div style={{ marginTop: 12, fontSize: 13, color: verde, fontWeight: 600 }}>
                  Acceder →
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}