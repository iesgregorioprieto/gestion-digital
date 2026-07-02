'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

export default function Login() {
  const [email, setEmail] = useState('director@iesgregorioprieto.es');
  const [password, setPassword] = useState('director2026');
  const [log, setLog] = useState([]);
  const [cargando, setCargando] = useState(false);

  const verde = '#1e6b2e';

  function add(linea) {
    setLog(prev => [...prev, linea]);
  }

  async function entrar() {
    setLog([]);
    setCargando(true);

    const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // --- PASO 1: comprobar variables de entorno ---
    add('🔍 PASO 1 — Variables de entorno');
    if (!URL) {
      add('❌ NEXT_PUBLIC_SUPABASE_URL está VACÍA (undefined)');
    } else {
      add(`✅ URL definida · longitud ${URL.length} (debe ser 40)`);
      add(`   empieza: "${URL.slice(0, 12)}..." termina: "...${URL.slice(-12)}"`);
      if (URL.length !== 40) add('⚠️ La URL NO mide 40 → está mal pegada');
      if (URL !== URL.trim()) add('⚠️ La URL tiene ESPACIOS al principio o final');
    }
    if (!KEY) {
      add('❌ NEXT_PUBLIC_SUPABASE_ANON_KEY está VACÍA (undefined)');
    } else {
      add(`✅ KEY definida · longitud ${KEY.length} (debe ser 208)`);
      add(`   empieza: "${KEY.slice(0, 12)}..." termina: "...${KEY.slice(-12)}"`);
      if (KEY.length !== 208) add('⚠️ La KEY NO mide 208 → está CORTADA o mal pegada');
      if (KEY !== KEY.trim()) add('⚠️ La KEY tiene ESPACIOS al principio o final');
    }

    if (!URL || !KEY) {
      add('🛑 Sin variables no se puede continuar. Problema = variables en Vercel.');
      setCargando(false);
      return;
    }

    // --- PASO 2: conectar y consultar ---
    add('🔍 PASO 2 — Conexión con Supabase');
    let supabase;
    try {
      supabase = createClient(URL, KEY);
    } catch (e) {
      add('❌ createClient falló: ' + e.message);
      setCargando(false);
      return;
    }

    let rows, err;
    try {
      const res = await supabase
        .from('profesores')
        .select('id, nombre, apellidos, rol, rol_gestion, estado, password_hash')
        .eq('email', email.trim().toLowerCase());
      rows = res.data;
      err = res.error;
    } catch (e) {
      add('❌ La consulta lanzó excepción: ' + e.message);
      add('   → Casi seguro: URL o KEY incorrectas (conexión fallida)');
      setCargando(false);
      return;
    }

    if (err) {
      add('❌ Supabase devolvió error: ' + JSON.stringify(err));
      setCargando(false);
      return;
    }

    add(`✅ Conexión OK · filas encontradas para ese email: ${rows ? rows.length : 0}`);

    // --- PASO 3: comprobar usuario ---
    add('🔍 PASO 3 — Usuario y contraseña');
    if (!rows || rows.length === 0) {
      add('❌ No existe ningún profesor con ese email exacto.');
      setCargando(false);
      return;
    }
    const data = rows[0];
    add(`✅ Usuario: ${data.nombre} ${data.apellidos} · estado="${data.estado}"`);

    if (data.estado !== 'activo') {
      add(`❌ El estado NO es "activo" (es "${data.estado}") → login rechazado`);
      setCargando(false);
      return;
    }

    if (data.password_hash !== password) {
      add(`❌ Contraseña NO coincide.`);
      add(`   En BD hay (longitud ${data.password_hash ? data.password_hash.length : 0}): "${data.password_hash}"`);
      add(`   Has tecleado (longitud ${password.length}): "${password}"`);
      setCargando(false);
      return;
    }

    add('🎉 ¡TODO CORRECTO! Login válido. Redirigiendo en 3 segundos...');
    sessionStorage.setItem('profesor_id', data.id);
    sessionStorage.setItem('profesor_nombre', `${data.nombre} ${data.apellidos}`);
    sessionStorage.setItem('profesor_rol_gestion', data.rol_gestion || '');
    sessionStorage.setItem('profesor_roles', JSON.stringify(Array.isArray(data.rol) ? data.rol : ['profesor']));
    setCargando(false);
    setTimeout(() => { window.location.href = '/profesor'; }, 3000);
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', padding: 16 }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 40 }}>🏫</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: verde }}>IES Gregorio Prieto</div>
        <div style={{ fontSize: 12, color: '#c0392b', marginTop: 4, fontWeight: 700 }}>🔧 MODO DIAGNÓSTICO — temporal</div>
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 28, maxWidth: 520, width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,0.10)' }}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#444', marginBottom: 6 }}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#444', marginBottom: 6 }}>Contraseña</label>
          <input type="text" value={password} onChange={e => setPassword(e.target.value)}
            style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box' }} />
        </div>
        <button onClick={entrar} disabled={cargando}
          style={{ width: '100%', padding: 14, borderRadius: 10, border: 'none', backgroundColor: verde, color: 'white', fontWeight: 700, fontSize: 16, cursor: 'pointer', opacity: cargando ? 0.7 : 1 }}>
          {cargando ? 'Comprobando...' : '🔍 Diagnosticar acceso'}
        </button>

        {log.length > 0 && (
          <div style={{ marginTop: 20, backgroundColor: '#1e1e1e', color: '#e0e0e0', borderRadius: 8, padding: 16, fontSize: 12.5, fontFamily: 'monospace', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}
