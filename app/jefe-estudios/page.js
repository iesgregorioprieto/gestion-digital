'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';

const azul = '#1e3a5f';
const verde = '#1e6b2e';

const MODULOS = [
  {
    id: 'datos',
    emoji: '📊',
    titulo: 'Datos del Centro',
    descripcion: 'Importa grupos y alumnos desde Delphos al inicio de curso',
    href: '/jefe-estudios/datos',
    disponible: true,
  },
  {
    id: 'ausencias',
    emoji: '🏥',
    titulo: 'Gestión de Ausencias',
    descripcion: 'Supervisa ausencias, gestiona justificaciones y registra ausencias manualmente',
    href: '/jefe-estudios/ausencias',
    disponible: true,
  },
  {
    id: 'autorizaciones',
    emoji: '📋',
    titulo: 'Autorizaciones',
    descripcion: 'Importa y gestiona las autorizaciones de alumnos',
    href: '/autorizaciones',
    disponible: true,
  },
  {
    id: 'guardias',
    emoji: '📅',
    titulo: 'Guardias',
    descripcion: 'Gestión del cuadrante de guardias del profesorado',
    href: '/guardias',
    disponible: false,
  },
];

export default function PanelJefeEstudios() {
  const [nombre, setNombre] = useState('');

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    const rol = sessionStorage.getItem('profesor_rol_gestion');
    if (!id || rol !== 'jefe_estudios') {
      window.location.href = '/login';
      return;
    }
    setNombre(sessionStorage.getItem('profesor_nombre') || '');
  }, []);

  function cerrarSesion() {
    sessionStorage.clear();
    window.location.href = '/login';
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      {/* HEADER */}
      <div style={{ backgroundColor: azul, color: 'white', padding: '0 20px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 26 }}>🏫</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 17 }}>Panel de Jefatura de Estudios</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>IES Gregorio Prieto · {nombre}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button onClick={() => window.location.href = '/profesor'} style={{ background: 'none', border: '1.5px solid rgba(255,255,255,0.4)', color: 'white', padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>← Inicio</button>
            <button onClick={cerrarSesion} style={{ background: 'none', border: '1.5px solid rgba(255,255,255,0.4)', color: 'white', padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>🚪 Salir</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>

        {/* BIENVENIDA */}
        <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 20, marginBottom: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', borderLeft: `4px solid ${azul}` }}>
          <div style={{ fontSize: 22, marginBottom: 4 }}>📚</div>
          <div style={{ fontWeight: 800, fontSize: 18, color: azul, marginBottom: 4 }}>Bienvenido/a, {nombre.split(' ')[0]}</div>
          <div style={{ fontSize: 14, color: '#666' }}>Panel de gestión de Jefatura de Estudios · IES Gregorio Prieto · Valdepeñas</div>
        </div>

        {/* MÓDULOS */}
        <div style={{ fontWeight: 700, fontSize: 15, color: azul, marginBottom: 14 }}>Módulos de gestión</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {MODULOS.map(m => (
            <div key={m.id} onClick={() => m.disponible && (window.location.href = m.href)}
              style={{
                backgroundColor: 'white', borderRadius: 14, padding: 20,
                boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
                cursor: m.disponible ? 'pointer' : 'default',
                opacity: m.disponible ? 1 : 0.6,
                border: `2px solid ${m.disponible ? '#e0e0e0' : '#f0f0f0'}`,
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={e => { if (m.disponible) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)'; }}}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.07)'; }}
            >
              <div style={{ fontSize: 32, marginBottom: 10 }}>{m.emoji}</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: azul, marginBottom: 6 }}>
                {m.titulo}
                {!m.disponible && <span style={{ marginLeft: 8, fontSize: 11, color: '#aaa', fontWeight: 400 }}>Próximo</span>}
              </div>
              <div style={{ fontSize: 13, color: '#666', lineHeight: 1.5 }}>{m.descripcion}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
