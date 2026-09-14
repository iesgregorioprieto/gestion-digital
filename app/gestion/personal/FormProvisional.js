'use client';

import { useState } from 'react';
import { consulta } from '@/lib/consulta';

const VERDE = '#166534';
const ROJO  = '#991b1b';
const AZUL  = '#1e3a5f';

export default function FormProvisional() {
  const [nombre,      setNombre]      = useState('');
  const [apellidos,   setApellidos]   = useState('');
  const [departamento,setDepartamento]= useState('');
  const [email,       setEmail]       = useState('');
  const [guardando,   setGuardando]   = useState(false);
  const [mensaje,     setMensaje]     = useState(null);
  const [creados,     setCreados]     = useState([]);

  function aviso(texto, tipo = 'ok') {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 6000);
  }

  async function crear() {
    if (!nombre.trim() || !apellidos.trim() || !departamento.trim() || !email.trim()) {
      return aviso('Rellena todos los campos', 'error');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return aviso('El email no parece válido', 'error');
    }
    setGuardando(true);
    try {
      const r = await fetch('/api/profesores/provisional', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre.trim(), apellidos: apellidos.trim(),
          departamento: departamento.trim(), email: email.trim() }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setCreados(prev => [{ nombre: nombre.trim(), apellidos: apellidos.trim(),
        departamento: departamento.trim(), email: email.trim() }, ...prev]);
      setNombre(''); setApellidos(''); setDepartamento(''); setEmail('');
      aviso(`${apellidos.trim()}, ${nombre.trim()} dado de alta. Contraseña: 1234`);
    } catch (e) {
      aviso(e.message || 'No se ha podido crear la cuenta', 'error');
    }
    setGuardando(false);
  }

  const campo = (label, value, onChange, placeholder, type = 'text') => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12.5, fontWeight: 700, color: '#475569',
        display: 'block', marginBottom: 5 }}>{label} *</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', padding: '11px 13px', borderRadius: 9,
          border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box' }} />
    </div>
  );

  return (
    <div>
      <p style={{ fontSize: 13, color: '#666', margin: '0 0 18px', lineHeight: 1.65 }}>
        Para sustitutos que llegan sin correo corporativo y no pueden registrarse solos.
        Se crea la cuenta con los datos mínimos y la contraseña <strong>1234</strong>.
        Cuando el sustituto se registre con ese email, la cuenta provisional pasa a ser
        definitiva y se le pide que cambie la contraseña.
      </p>

      {mensaje && (
        <div style={{
          padding: '11px 15px', borderRadius: 9, marginBottom: 16,
          fontSize: 13.5, fontWeight: 600,
          backgroundColor: mensaje.tipo === 'ok' ? '#f0fdf4' : '#fef2f2',
          border: `1.5px solid ${mensaje.tipo === 'ok' ? '#bbf7d0' : '#fecaca'}`,
          color: mensaje.tipo === 'ok' ? VERDE : ROJO,
        }}>{mensaje.texto}</div>
      )}

      <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 20,
        border: '1px solid #e5e7eb', marginBottom: 20 }}>
        <div style={{ fontWeight: 800, color: AZUL, fontSize: 15, marginBottom: 16 }}>
          ➕ Nueva cuenta provisional
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <div>{campo('Nombre', nombre, setNombre, 'Ana')}</div>
          <div>{campo('Apellidos', apellidos, setApellidos, 'Martínez López')}</div>
        </div>
        {campo('Departamento', departamento, setDepartamento, 'Inglés, TMV, Matemáticas…')}
        {campo('Email personal o provisional', email, setEmail, 'ana.martinez@gmail.com', 'email')}

        <div style={{ padding: '10px 13px', borderRadius: 8, backgroundColor: '#fffbeb',
          border: '1px solid #fcd34d', fontSize: 12.5, color: '#92400e', marginBottom: 16 }}>
          🔑 La contraseña inicial será <strong>1234</strong>. Comunícasela tú directamente.
        </div>

        <button onClick={crear} disabled={guardando}
          style={{ padding: '12px 22px', borderRadius: 9, border: 'none',
            backgroundColor: guardando ? '#94a3b8' : VERDE, color: 'white',
            fontWeight: 800, fontSize: 14, cursor: guardando ? 'default' : 'pointer' }}>
          {guardando ? 'Creando…' : 'Crear cuenta y dar de alta'}
        </button>
      </div>

      {creados.length > 0 && (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#475569', marginBottom: 10 }}>
            Cuentas creadas esta sesión
          </div>
          {creados.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', backgroundColor: '#f0fdf4', borderRadius: 9,
              border: '1px solid #bbf7d0', marginBottom: 8, fontSize: 13 }}>
              <span style={{ fontWeight: 700, color: AZUL }}>
                {c.apellidos}, {c.nombre}
              </span>
              <span style={{ color: '#94a3b8' }}>·</span>
              <span style={{ color: '#475569' }}>{c.departamento}</span>
              <span style={{ color: '#94a3b8' }}>·</span>
              <span style={{ color: '#64748b' }}>{c.email}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700,
                color: VERDE, backgroundColor: '#dcfce7',
                padding: '2px 9px', borderRadius: 10 }}>
                contraseña: 1234
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
