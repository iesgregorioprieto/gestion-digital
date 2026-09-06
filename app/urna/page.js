'use client';
export const dynamic = 'force-dynamic';

/**
 * URNA — TABLET COMPARTIDA DEL CLAUSTRO
 *
 * Para quien no lleva el móvil encima o no quiere teclear su clave
 * delante de nadie: se acerca a la tablet, se identifica, vota, y la
 * sesión se cierra sola. La pantalla vuelve a quedar en blanco,
 * dispuesta para el siguiente.
 *
 * Tres cosas la diferencian de la pantalla normal de votar, y las tres
 * son porque el aparato pasa de mano en mano:
 *
 *   · La sesión se cierra en cuanto se vota, sin pedirlo. Si no, el
 *     siguiente que coge la tablet estaría dentro como el anterior.
 *   · No se llega a ningún otro sitio del portal: aquí solo se vota.
 *   · Si alguien se identifica y se va sin votar, la sesión se cierra
 *     sola al minuto. Una tablet abierta encima de una mesa no puede
 *     quedarse esperando.
 *
 * El voto se registra por las mismas rutas de siempre, así que sigue
 * siendo secreto y sigue sin poder repetirse.
 */

import { useState, useEffect, useRef } from 'react';

const VERDE = '#1e6b2e';
const AZUL = '#1e3a5f';

// Si se identifica y no vota, se cierra sola
const SEGUNDOS_INACTIVA = 60;

export default function Urna() {
  const [fase, setFase] = useState('identificar');   // identificar · votar · gracias
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [quien, setQuien] = useState('');
  const [votaciones, setVotaciones] = useState([]);
  const [elegida, setElegida] = useState({});
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [restante, setRestante] = useState(SEGUNDOS_INACTIVA);

  const cuenta = useRef(null);

  // ── Cuenta atrás de inactividad ──
  useEffect(() => {
    if (fase !== 'votar') return;
    setRestante(SEGUNDOS_INACTIVA);
    cuenta.current = setInterval(() => {
      setRestante(r => {
        if (r <= 1) { salir('Se ha cerrado por inactividad.'); return SEGUNDOS_INACTIVA; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(cuenta.current);
  }, [fase]);

  async function entrar() {
    const em = email.trim();
    if (!em || !password) { setError('Escribe tu correo y tu contraseña.'); return; }
    setOcupado(true); setError('');

    try {
      const r = await fetch('/api/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'entrar', email: em, password }),
      });
      const d = await r.json();

      if (!r.ok) {
        const textos = {
          no_existe: 'Ese correo no está dado de alta.',
          credenciales: 'La contraseña no es correcta.',
          inactivo: 'Esa cuenta no está activa.',
          sin_verificar: 'Esa cuenta todavía no ha verificado el correo.',
          demasiados_intentos: d.mensaje || 'Demasiados intentos. Espera unos minutos.',
        };
        setError(textos[d.error] || 'No se ha podido entrar.');
        setPassword('');
        setOcupado(false);
        return;
      }

      // La contraseña no se queda ni un momento de más en memoria
      setPassword('');
      setQuien(`${d.profesor?.nombre || ''} ${d.profesor?.apellidos || ''}`.trim());

      const rv = await fetch('/api/votaciones');
      const dv = await rv.json();
      const abiertas = (dv.votaciones || []).filter(v => v.abierta && v.puedeVotar && !v.yaVote);

      if (abiertas.length === 0) {
        const yaVotadas = (dv.votaciones || []).filter(v => v.abierta && v.yaVote);
        await cerrarSesion();
        setFase('identificar');
        setError(yaVotadas.length > 0
          ? 'Ya has votado en las votaciones abiertas.'
          : 'Ahora mismo no tienes ninguna votación abierta.');
        setEmail('');
        setOcupado(false);
        return;
      }

      setVotaciones(abiertas);
      setFase('votar');
    } catch {
      setError('No hay conexión. Inténtalo otra vez.');
    }
    setOcupado(false);
  }

  async function cerrarSesion() {
    try {
      await fetch('/api/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'salir' }),
      });
    } catch { /* si falla la red, la cookie caduca igualmente */ }
    sessionStorage.clear();
  }

  async function salir(motivo) {
    clearInterval(cuenta.current);
    await cerrarSesion();
    setQuien(''); setEmail(''); setPassword('');
    setVotaciones([]); setElegida({});
    setFase('identificar');
    setError(motivo || '');
  }

  async function votar(v) {
    const opcion = elegida[v.id];
    if (!opcion) { setError('Elige una opción antes de votar.'); return; }
    setOcupado(true); setError('');

    const r = await fetch('/api/votaciones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'votar', id: v.id, datos: { opcion } }),
    });

    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      setError(e.error || 'No se ha podido registrar el voto.');
      setOcupado(false);
      return;
    }

    // Quedan más votaciones abiertas: sigue el mismo profesor
    const quedan = votaciones.filter(x => x.id !== v.id);
    if (quedan.length > 0) {
      setVotaciones(quedan);
      setRestante(SEGUNDOS_INACTIVA);
      setOcupado(false);
      return;
    }

    // Última: se cierra la sesión y la urna queda libre
    clearInterval(cuenta.current);
    setFase('gracias');
    await cerrarSesion();
    setOcupado(false);
    setTimeout(() => {
      setQuien(''); setEmail(''); setVotaciones([]); setElegida({});
      setFase('identificar'); setError('');
    }, 3500);
  }

  const marco = {
    minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
  };
  const tarjeta = {
    backgroundColor: 'white', borderRadius: 16, padding: '32px 34px', width: '100%', maxWidth: 620,
    boxShadow: '0 4px 20px rgba(0,0,0,0.09)',
  };
  const campo = {
    width: '100%', padding: '15px 16px', borderRadius: 10, border: '1.5px solid #ddd',
    fontSize: 19, boxSizing: 'border-box', marginBottom: 13,
  };

  // ── Gracias ──
  if (fase === 'gracias') {
    return (
      <div style={marco}>
        <div style={{ ...tarjeta, textAlign: 'center' }}>
          <div style={{ fontSize: 64, marginBottom: 10 }}>✅</div>
          <div style={{ fontSize: 27, fontWeight: 800, color: VERDE, marginBottom: 8 }}>Voto registrado</div>
          <div style={{ fontSize: 17, color: '#475569' }}>
            Gracias. La urna queda libre para el siguiente.
          </div>
        </div>
      </div>
    );
  }

  // ── Votar ──
  if (fase === 'votar') {
    return (
      <div style={marco}>
        <div style={tarjeta}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 16, color: '#475569' }}>
              Votando como <strong style={{ color: AZUL }}>{quien}</strong>
            </div>
            <button onClick={() => salir('')}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1.5px solid #cbd5e1',
                backgroundColor: 'white', color: '#475569', fontSize: 14, cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>

          {votaciones.map(v => (
            <div key={v.id} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 23, fontWeight: 800, color: AZUL, marginBottom: 6, lineHeight: 1.3 }}>{v.pregunta}</div>
              {v.descripcion && (
                <div style={{ fontSize: 15, color: '#475569', marginBottom: 14, lineHeight: 1.6 }}>{v.descripcion}</div>
              )}

              {(v.opciones || []).map(o => {
                const puesta = elegida[v.id] === o;
                return (
                  <button key={o} onClick={() => setElegida(p => ({ ...p, [v.id]: o }))}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', marginBottom: 10,
                      padding: '17px 18px', borderRadius: 11, fontSize: 19, cursor: 'pointer',
                      fontWeight: puesta ? 800 : 500,
                      border: `2.5px solid ${puesta ? VERDE : '#e2e8f0'}`,
                      backgroundColor: puesta ? '#dcfce7' : 'white',
                      color: puesta ? '#14532d' : '#334155',
                    }}>
                    {puesta ? '🔘' : '⚪'}  {o}
                  </button>
                );
              })}

              <button onClick={() => votar(v)} disabled={ocupado || !elegida[v.id]}
                style={{
                  width: '100%', marginTop: 6, padding: '17px', borderRadius: 11, border: 'none',
                  fontSize: 20, fontWeight: 800, color: 'white',
                  backgroundColor: (ocupado || !elegida[v.id]) ? '#94a3b8' : VERDE,
                  cursor: (ocupado || !elegida[v.id]) ? 'default' : 'pointer',
                }}>
                {ocupado ? 'Registrando…' : '🗳️ Votar'}
              </button>

              <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 8, textAlign: 'center' }}>
                Una vez votes no se puede cambiar.
              </div>
            </div>
          ))}

          {error && (
            <div style={{ padding: '12px 15px', borderRadius: 9, backgroundColor: '#fee2e2',
              color: '#991b1b', fontSize: 15, fontWeight: 600, marginTop: 10 }}>{error}</div>
          )}

          <div style={{ marginTop: 14, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>
            La sesión se cerrará sola en {restante} s
          </div>
        </div>
      </div>
    );
  }

  // ── Identificarse ──
  return (
    <div style={marco}>
      <div style={tarjeta}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ fontSize: 52, marginBottom: 6 }}>🗳️</div>
          <div style={{ fontSize: 27, fontWeight: 800, color: AZUL }}>Urna del claustro</div>
          <div style={{ fontSize: 16, color: '#64748b', marginTop: 6, lineHeight: 1.55 }}>
            Identifícate, vota, y la sesión se cerrará sola.
          </div>
        </div>

        <input type="email" value={email} placeholder="Tu correo"
          autoComplete="off" autoCapitalize="none" spellCheck={false}
          onChange={e => setEmail(e.target.value)} style={campo} />

        <input type="password" value={password} placeholder="Tu contraseña"
          autoComplete="off"
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') entrar(); }} style={campo} />

        {error && (
          <div style={{ padding: '12px 15px', borderRadius: 9, backgroundColor: '#fee2e2',
            color: '#991b1b', fontSize: 15, fontWeight: 600, marginBottom: 13 }}>{error}</div>
        )}

        <button onClick={entrar} disabled={ocupado}
          style={{
            width: '100%', padding: '17px', borderRadius: 11, border: 'none',
            fontSize: 20, fontWeight: 800, color: 'white',
            backgroundColor: ocupado ? '#94a3b8' : VERDE,
            cursor: ocupado ? 'default' : 'pointer',
          }}>
          {ocupado ? 'Comprobando…' : 'Entrar a votar'}
        </button>

        <div style={{ marginTop: 16, textAlign: 'center', fontSize: 12.5, color: '#94a3b8', lineHeight: 1.6 }}>
          Desde esta pantalla solo se puede votar. El voto es secreto:
          se guarda quién ha votado y qué se ha votado en sitios separados.
        </div>
      </div>
    </div>
  );
}
