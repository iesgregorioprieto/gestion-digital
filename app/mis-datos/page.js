'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';
import GestionNotificaciones from '@/components/GestionNotificaciones';
import TamanoLetra from '@/components/TamanoLetra';
import { DEPARTAMENTOS } from '@/lib/sectores';

const VERDE = '#1e6b2e';


const ESPECIALIDADES = [
  { valor: 'TMV', emoji: '🚗' }, { valor: 'COMERCIO', emoji: '🛍️' },
  { valor: 'ELECTRICIDAD', emoji: '⚡' }, { valor: 'INFORMÁTICA', emoji: '💻' },
  { valor: 'HOSTELERÍA', emoji: '🍽️' }, { valor: 'INDUSTRIAS ALIMENTARIAS', emoji: '🥖' },
  { valor: 'ADMINISTRACIÓN', emoji: '🏢' }, { valor: 'ESO/BACHILLERATO', emoji: '🎓' },
];

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();
  const km = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, km, 256
  );
  const hex = a => Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
  return hex(salt) + ':' + hex(new Uint8Array(bits));
}

export default function MisDatos() {
  const [profId,   setProfId]   = useState(null);
  const [cargando, setCargando] = useState(true);
  const [pestana,  setPestana]  = useState('datos');
  const [mensaje,  setMensaje]  = useState(null);

  const [email, setEmail] = useState('');
  const [form, setForm] = useState({
    nombre: '', apellidos: '', departamento: '', especialidad: '',
    tipo_contrato: 'Funcionario de carrera',
    anio_centro: '', anio_cuerpo: '', telefono: '',
    esTutor: false, grupoTutoria: '', rolOriginal: ['profesor'],
  });
  const [guardando, setGuardando] = useState(false);

  const [pw, setPw] = useState({ actual: '', nueva: '', repite: '' });
  const [verPass, setVerPass] = useState(false);
  const [cambiandoPw, setCambiandoPw] = useState(false);

  const set   = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setP  = (k, v) => setPw(p => ({ ...p, [k]: v }));
  const aviso = (texto, tipo) => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 4000);
  };

  useEffect(() => {
    (async () => {
      const id = sessionStorage.getItem('profesor_id');
      if (!id) { window.location.href = '/login'; return; }
      setProfId(id);

      // La ficha completa (con el teléfono) se pide al servidor
      const resp = await fetch('/api/profesores?mi_ficha=1');
      const cuerpo = await resp.json();
      const p = cuerpo.profesor;
      if (p) {
        setEmail(p.email || '');
        setForm({
          nombre:            p.nombre        || '',
          apellidos:         p.apellidos     || '',
          departamento:      p.departamento  || '',
          especialidad:      p.especialidad  || '',
          tipo_contrato:     p.tipo_contrato || 'Funcionario de carrera',
          anio_centro: p.anio_centro?.toString()
            || (p.antiguedad_centro ? (new Date().getFullYear() - p.antiguedad_centro).toString() : ''),
          anio_cuerpo: p.anio_cuerpo?.toString()
            || (p.antiguedad_cuerpo ? (new Date().getFullYear() - p.antiguedad_cuerpo).toString() : ''),
          telefono:          p.telefono      || '',
          rolOriginal:       Array.isArray(p.rol) ? p.rol : ['profesor'],
          esTutor:           Array.isArray(p.rol) && p.rol.includes('tutor'),
          grupoTutoria:      p.grupo_tutoria || '',
        });
      }
      setCargando(false);
    })();
  }, []);

  async function guardarDatos() {
    if (!form.nombre.trim())    return aviso('El nombre es obligatorio.', 'error');
    if (!form.apellidos.trim()) return aviso('Los apellidos son obligatorios.', 'error');
    if (!form.departamento)     return aviso('Selecciona tu departamento.', 'error');
    if (form.esTutor && !form.grupoTutoria.trim())
      return aviso('Indica de qué grupo eres tutor/a.', 'error');

    setGuardando(true);
    try {
      const rolActual = Array.isArray(form.rolOriginal) ? form.rolOriginal : ['profesor'];
      let rolNuevo = Array.isArray(rolActual) ? [...rolActual] : ['profesor'];
      if (form.esTutor && !rolNuevo.includes('tutor')) rolNuevo.push('tutor');
      if (!form.esTutor) rolNuevo = rolNuevo.filter(r => r !== 'tutor');

      // El servidor guarda la ficha: comprueba la sesión y solo permite
      // cambiar los campos propios (nunca el rol de gestión ni el estado).
      const resp = await fetch('/api/profesores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'guardar_mi_ficha',
          datos: {
            nombre:            form.nombre.trim(),
            apellidos:         form.apellidos.trim(),
            departamento:      form.departamento,
            especialidad:      form.especialidad || null,
            tipo_contrato:     form.tipo_contrato,
            anio_centro: form.anio_centro ? parseInt(form.anio_centro) : null,
            anio_cuerpo: form.anio_cuerpo ? parseInt(form.anio_cuerpo) : null,
            antiguedad_centro: form.anio_centro ? Math.max(0, new Date().getFullYear() - parseInt(form.anio_centro)) : null,
            antiguedad_cuerpo: form.anio_cuerpo ? Math.max(0, new Date().getFullYear() - parseInt(form.anio_cuerpo)) : null,
            telefono:          form.telefono.trim() || null,
            rol:               rolNuevo,
            grupo_tutoria:     form.esTutor ? form.grupoTutoria.trim().toUpperCase() : null,
          },
        }),
      });

      if (!resp.ok) {
        const err = await resp.json();
        aviso('Error al guardar: ' + (err.error || ''), 'error');
        setGuardando(false);
        return;
      }

      sessionStorage.setItem('profesor_nombre', form.nombre.trim() + ' ' + form.apellidos.trim());
      sessionStorage.setItem('profesor_roles', JSON.stringify(rolNuevo));
      aviso('✅ Datos guardados correctamente', 'ok');
    } catch (e) {
      aviso('Error inesperado: ' + e.message, 'error');
    }
    setGuardando(false);
  }

  async function cambiarPassword() {
    if (!pw.actual)             return aviso('Introduce tu contraseña actual.', 'error');
    if (pw.nueva.length < 6)    return aviso('La nueva contraseña debe tener al menos 6 caracteres.', 'error');
    if (pw.nueva !== pw.repite) return aviso('Las contraseñas nuevas no coinciden.', 'error');
    if (pw.nueva === pw.actual) return aviso('La nueva contraseña debe ser distinta de la actual.', 'error');

    setCambiandoPw(true);
    try {
      // El servidor comprueba la contraseña actual y guarda la nueva.
      // El navegador no llega a ver ningún hash.
      const r = await fetch('/api/cuenta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'cambiar_password',
          passwordActual: pw.actual,
          passwordNueva: pw.nueva,
        }),
      });
      const res = await r.json();

      if (!r.ok) {
        if (res.error === 'password_incorrecta') aviso('La contraseña actual no es correcta.', 'error');
        else if (res.error === 'sin_sesion')     aviso('Tu sesión ha caducado. Vuelve a entrar.', 'error');
        else                                      aviso('No se pudo cambiar: ' + (res.error || ''), 'error');
        setCambiandoPw(false);
        return;
      }

      setPw({ actual: '', nueva: '', repite: '' });
      aviso('✅ Contraseña cambiada correctamente');
    } catch (e) {
      aviso('Error inesperado: ' + e.message, 'error');
    }
    setCambiandoPw(false);
  }

  if (cargando) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', color: '#888' }}>
        ⏳ Cargando tus datos...
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      <div style={{ backgroundColor: VERDE, color: 'white', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>⚙️ Mis datos</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>{form.nombre} {form.apellidos}</div>
        </div>
        <a href="/profesor" style={{ color: 'white', textDecoration: 'none', fontSize: 14 }}>← Volver</a>
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '20px 16px 40px' }}>

        {mensaje && (
          <div style={{
            padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 14, fontWeight: 600,
            backgroundColor: mensaje.tipo === 'ok' ? '#dcfce7' : '#fee2e2',
            color:           mensaje.tipo === 'ok' ? '#166534' : '#991b1b',
            border: `1.5px solid ${mensaje.tipo === 'ok' ? '#86efac' : '#fca5a5'}`,
          }}>
            {mensaje.texto}
          </div>
        )}

        {/* Pestañas */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {[
            { id: 'datos',    label: '👤 Datos' },
            { id: 'password', label: '🔑 Clave' },
            { id: 'avisos',   label: '🔔 Avisos' },
            { id: 'letra',    label: '🔠 Letra' },
          ].map(t => (
            <button key={t.id} onClick={() => setPestana(t.id)} style={{
              flex: 1, padding: '11px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700,
              border: pestana === t.id ? 'none' : '1.5px solid #ddd',
              backgroundColor: pestana === t.id ? VERDE : 'white',
              color: pestana === t.id ? 'white' : '#666',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── PESTAÑA DATOS ── */}
        {pestana === 'datos' && (
          <div style={tarjeta}>
            <div style={{ marginBottom: 18, padding: '10px 14px', backgroundColor: '#f5f5f5', borderRadius: 8, fontSize: 13, color: '#555' }}>
              📧 {email}
              <div style={{ fontSize: 11, color: '#999', marginTop: 3 }}>
                El email no se puede cambiar. Si necesitas modificarlo, avisa al secretario.
              </div>
            </div>

            <Seccion>👤 Datos personales</Seccion>

            <Campo label="Nombre *">
              <input value={form.nombre} onChange={e => set('nombre', e.target.value)} style={inputEstilo} />
            </Campo>
            <Campo label="Apellidos *">
              <input value={form.apellidos} onChange={e => set('apellidos', e.target.value)} style={inputEstilo} />
            </Campo>
            <Campo label="Teléfono de contacto">
              <input type="tel" value={form.telefono} onChange={e => set('telefono', e.target.value)}
                placeholder="Para avisos urgentes" style={inputEstilo} />
            </Campo>

            <Seccion>💼 Datos laborales</Seccion>

            <Campo label="Departamento *">
              <select value={form.departamento} onChange={e => set('departamento', e.target.value)} style={inputEstilo}>
                <option value="">— Selecciona —</option>
                {DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </Campo>

            <Campo label="Especialidad (cuadrante de guardias)">
              <select value={form.especialidad} onChange={e => set('especialidad', e.target.value)} style={inputEstilo}>
                <option value="">— Selecciona —</option>
                {ESPECIALIDADES.map(e => <option key={e.valor} value={e.valor}>{e.emoji} {e.valor}</option>)}
              </select>
            </Campo>

            <Campo label="Tipo de contrato">
              <select value={form.tipo_contrato} onChange={e => set('tipo_contrato', e.target.value)} style={inputEstilo}>
                <option>Funcionario de carrera</option>
                <option>Interino con vacante</option>
                <option>Interino sin vacante</option>
              </select>
            </Campo>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Campo label="Año de llegada al centro">
                <input type="number" min="1970" max={new Date().getFullYear()}
                  value={form.anio_centro} placeholder="Ej: 2018"
                  onChange={e => set('anio_centro', e.target.value)} style={inputEstilo} />
              </Campo>
              <Campo label="Año de ingreso en el cuerpo">
                <input type="number" min="1970" max={new Date().getFullYear()}
                  value={form.anio_cuerpo} placeholder="Ej: 2010"
                  onChange={e => set('anio_cuerpo', e.target.value)} style={inputEstilo} />
              </Campo>
            </div>

            <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#166534', lineHeight: 1.6, marginBottom: 13 }}>
              💡 Indica el <strong>año</strong>, no los años que llevas. Así no hay que
              actualizarlo cada curso: la antigüedad se calcula sola.
              {form.anio_centro && (
                <div style={{ marginTop: 6 }}>
                  Actualmente: <strong>{Math.max(0, new Date().getFullYear() - parseInt(form.anio_centro))} años</strong> en el centro
                  {form.anio_cuerpo && <> · <strong>{Math.max(0, new Date().getFullYear() - parseInt(form.anio_cuerpo))} años</strong> en el cuerpo</>}
                </div>
              )}
            </div>

            <Seccion>🤝 Tutoría</Seccion>

            <div
              onClick={() => set('esTutor', !form.esTutor)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
                border: `1.5px solid ${form.esTutor ? VERDE : '#ddd'}`,
                backgroundColor: form.esTutor ? '#f0fdf4' : 'white',
                marginBottom: form.esTutor ? 10 : 4,
              }}
            >
              <div style={{
                width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                border: `2px solid ${form.esTutor ? VERDE : '#ccc'}`,
                backgroundColor: form.esTutor ? VERDE : 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontSize: 13, fontWeight: 700,
              }}>
                {form.esTutor ? '✓' : ''}
              </div>
              <div style={{ fontSize: 14, color: form.esTutor ? VERDE : '#555', fontWeight: form.esTutor ? 600 : 400 }}>
                Soy tutor/a de un grupo
              </div>
            </div>

            {form.esTutor && (
              <Campo label="¿De qué grupo? *">
                <input value={form.grupoTutoria} onChange={e => set('grupoTutoria', e.target.value)}
                  placeholder="Ej: 2ESO-A, GM-2CAR" style={inputEstilo} />
              </Campo>
            )}

            <button onClick={guardarDatos} disabled={guardando} style={{
              width: '100%', padding: '13px', marginTop: 14, backgroundColor: VERDE,
              color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700,
              cursor: guardando ? 'not-allowed' : 'pointer', opacity: guardando ? 0.7 : 1,
            }}>
              {guardando ? '⏳ Guardando...' : '💾 Guardar cambios'}
            </button>
          </div>
        )}

        {/* ── PESTAÑA TAMAÑO DE LETRA ── */}
        {pestana === 'letra' && (
          <div style={tarjeta}>
            <TamanoLetra />
          </div>
        )}

        {/* ── PESTAÑA NOTIFICACIONES ── */}
        {pestana === 'avisos' && profId && (
          <div style={tarjeta}>
            <GestionNotificaciones profesorId={profId} />
          </div>
        )}

        {/* ── PESTAÑA CONTRASEÑA ── */}
        {pestana === 'password' && (
          <div style={tarjeta}>
            <Seccion>🔑 Cambiar contraseña</Seccion>

            <Campo label="Contraseña actual *">
              <div style={{ position: 'relative' }}>
                <input type={verPass ? 'text' : 'password'} value={pw.actual} onChange={e => setP('actual', e.target.value)}
                  placeholder="Tu contraseña de ahora" style={{ ...inputEstilo, paddingRight: 44 }} />
                <button type="button" onClick={() => setVerPass(v => !v)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#888', padding: 0 }}>
                  {verPass ? '🙈' : '👁️'}
                </button>
              </div>
            </Campo>

            <Campo label="Nueva contraseña *">
              <div style={{ position: 'relative' }}>
                <input type={verPass ? 'text' : 'password'} value={pw.nueva} onChange={e => setP('nueva', e.target.value)}
                  placeholder="Mínimo 6 caracteres" style={{ ...inputEstilo, paddingRight: 44 }} />
                <button type="button" onClick={() => setVerPass(v => !v)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#888', padding: 0 }}>
                  {verPass ? '🙈' : '👁️'}
                </button>
              </div>
            </Campo>

            <Campo label="Repite la nueva contraseña *">
              <div style={{ position: 'relative' }}>
                <input type={verPass ? 'text' : 'password'} value={pw.repite} onChange={e => setP('repite', e.target.value)}
                  placeholder="Repite la nueva"
                  onKeyDown={e => e.key === 'Enter' && cambiarPassword()}
                  style={{ ...inputEstilo, paddingRight: 44 }} />
                <button type="button" onClick={() => setVerPass(v => !v)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#888', padding: 0 }}>
                  {verPass ? '🙈' : '👁️'}
                </button>
              </div>
            </Campo>

            <button onClick={cambiarPassword} disabled={cambiandoPw} style={{
              width: '100%', padding: '13px', marginTop: 10, backgroundColor: VERDE,
              color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700,
              cursor: cambiandoPw ? 'not-allowed' : 'pointer', opacity: cambiandoPw ? 0.7 : 1,
            }}>
              {cambiandoPw ? '⏳ Cambiando...' : '🔑 Cambiar contraseña'}
            </button>

            <div style={{ marginTop: 16, backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#166534', lineHeight: 1.6 }}>
              ℹ️ Si has olvidado tu contraseña actual, cierra sesión y usa
              <strong> ¿Has olvidado tu contraseña?</strong> en la pantalla de acceso.
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Auxiliares ──────────────────────────────────────

function Seccion({ children }) {
  return (
    <div style={{ fontSize: 14, fontWeight: 700, color: '#333', marginTop: 18, marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid #eee' }}>
      {children}
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 5 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputEstilo = {
  width: '100%',
  padding: '13px 14px',
  borderRadius: 8,
  border: '1.5px solid #b0b8c1',
  fontSize: 16,              // 16px evita que el móvil haga zoom al escribir
  color: '#1f2937',          // sin esto, algunos navegadores lo pintan casi blanco
  backgroundColor: '#ffffff',
  boxSizing: 'border-box',
  fontFamily: 'system-ui, sans-serif',
  WebkitTextFillColor: '#1f2937',   // Safari/Chrome en Android
  opacity: 1,
};

const tarjeta = {
  backgroundColor: 'white', borderRadius: 14, padding: 24,
  boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
};
