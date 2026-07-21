'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';
const azul = '#1a3a6b';
const verde = '#1e6b2e';

export default function PanelGestion() {
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [rolUsuario, setRolUsuario] = useState('');

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    const nombre = sessionStorage.getItem('profesor_nombre');
    const rol = sessionStorage.getItem('profesor_rol_gestion');
    
    if (!id) { window.location.href = '/login'; return; }
    
    // 🔒 Solo equipo directivo
    if (rol !== 'director' && rol !== 'secretario' && rol !== 'jefe_estudios') {
      window.location.href = '/profesor';
      return;
    }
    
    setNombreUsuario(nombre || '');
    setRolUsuario(rol || '');
  }, []);

  function cerrarSesion() {
    sessionStorage.clear();
    window.location.href = '/login';
  }

  const MODULOS = [
    {
      id: 'datos',
      emoji: '📊',
      titulo: 'Datos del Centro',
      descripcion: 'Carga grupos, alumnos y horarios desde Delphos',
      href: '/gestion/datos',
      bg: '#eff6ff',
      border: '#bfdbfe',
      color: '#1e40af',
    },
    {
      id: 'personal',
      emoji: '👥',
      titulo: 'Personal (Profesorado)',
      descripcion: 'Gestiona profesores: registros, roles y datos',
      href: '/gestion/personal',
      bg: '#faf5ff',
      border: '#d8b4fe',
      color: '#7e22ce',
    },
    {
      id: 'dld',
      emoji: '📄',
      titulo: 'Días Libre Disposición',
      descripcion: 'Gestiona las solicitudes de DLD del profesorado',
      href: '/gestion/dld',
      bg: '#f0fdf4',
      border: '#bbf7d0',
      color: '#15803d',
    },
    {
      id: 'ausencias',
      emoji: '🏥',
      titulo: 'Gestión de Ausencias',
      descripcion: 'Supervisa ausencias y justificaciones del profesorado',
      href: '/gestion/ausencias',
      bg: '#fff7ed',
      border: '#fed7aa',
      color: '#92400e',
    },
    {
      id: 'mantenimiento',
      emoji: '🔧',
      titulo: 'Mantenimiento',
      descripcion: 'Gestiona los reportes de desperfectos del centro',
      href: '/gestion/mantenimiento',
      bg: '#fef3c7',
      border: '#fde047',
      color: '#854d0e',
    },
    {
      id: 'compras',
      emoji: '🛒',
      titulo: 'Solicitudes de Compras',
      descripcion: 'Gestiona todas las solicitudes de compras y materiales',
      href: '/gestion/compras',
      bg: '#f3e8ff',
      border: '#e9d5ff',
      color: '#7e22ce',
    },
    {
      id: 'guardias',
      emoji: '🛡️',
      titulo: 'Guardias',
      descripcion: 'Gestiona y asigna guardias manualmente al profesorado',
      href: '/gestion/guardias',
      bg: '#fef3c7',
      border: '#fcd34d',
      color: '#92400e',
    },
    {
      id: 'autorizaciones',
      emoji: '📋',
      titulo: 'Autorizaciones del Alumnado',
      descripcion: 'Gestiona autorizaciones (salidas, actividades, imágenes)',
      href: '/gestion/autorizaciones',
      bg: '#fce7f3',
      border: '#fbcfe8',
      color: '#be185d',
    },
  ];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      {/* HEADER */}
      <div style={{ backgroundColor: azul, color: 'white', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>⚙️ Panel de Gestión del Centro</div>
          <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>IES Gregorio Prieto · Equipo directivo</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
            👤 {nombreUsuario}
            {rolUsuario === 'director' && ' · 👔 Director/a'}
            {rolUsuario === 'secretario' && ' · 📁 Secretario/a'}
            {rolUsuario === 'jefe_estudios' && ' · 📋 Jefe/a de Estudios'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
          <a href="/profesor" style={{ color: 'white', textDecoration: 'none', fontSize: 14, padding: '8px 16px', borderRadius: 8, border: '1.5px solid rgba(255,255,255,0.3)', transition: 'all 0.2s' }}>← Volver</a>
          <button onClick={cerrarSesion} style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid rgba(255,255,255,0.3)', backgroundColor: 'transparent', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>🚪 Salir</button>
        </div>
      </div>

      {/* CONTENIDO */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 16px' }}>

        {/* INTRO */}
        <div style={{ backgroundColor: 'white', borderRadius: 16, padding: '20px 24px', marginBottom: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', borderLeft: `5px solid ${azul}` }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: azul, marginBottom: 8 }}>📌 Bienvenido/a al Panel de Gestión</div>
          <p style={{ fontSize: 14, color: '#555', margin: 0, lineHeight: 1.6 }}>
            Desde este panel puedes gestionar todos los módulos del centro: solicitudes de días libres, ausencias del profesorado, compras, mantenimiento, autorizaciones del alumnado y datos del centro. Selecciona el módulo que necesites.
          </p>
        </div>

        {/* GRID DE MÓDULOS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
          {MODULOS.map(mod => (
            <a
              key={mod.id}
              href={mod.href}
              style={{
                display: 'block',
                backgroundColor: 'white',
                borderRadius: 14,
                padding: '24px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                textDecoration: 'none',
                border: `2px solid ${mod.border}`,
                transition: 'all 0.3s ease',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.12)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
              }}
            >
              {/* ICONO Y FONDO COLOR */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 16, 
                padding: '16px',
                backgroundColor: mod.bg,
                borderRadius: 12,
                marginBottom: 16,
              }}>
                <div style={{ fontSize: 40 }}>{mod.emoji}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: mod.color }}>{mod.titulo}</div>
                </div>
              </div>

              {/* DESCRIPCIÓN */}
              <div style={{ fontSize: 14, color: '#555', lineHeight: 1.5, marginBottom: 12 }}>
                {mod.descripcion}
              </div>

              {/* CTA LINK */}
              <div style={{ fontSize: 13, fontWeight: 700, color: mod.color, display: 'flex', alignItems: 'center', gap: 6 }}>
                Acceder →
              </div>
            </a>
          ))}
        </div>

        {/* FOOTER */}
        <div style={{ marginTop: 48, padding: '20px 24px', backgroundColor: '#f8fafb', borderRadius: 12, fontSize: 13, color: '#666', textAlign: 'center', border: '1px solid #e5e7eb' }}>
          💡 <strong>Consejo:</strong> Los profesores pueden acceder directamente a estos módulos desde sus paneles personales (solicitar compras, notificar ausencias, etc.). Este panel es solo para la gestión centralizada.
        </div>

      </div>

    </div>
  );
}
