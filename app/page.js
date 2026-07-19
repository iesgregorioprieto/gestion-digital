'use client';

export default function Home() {
  const verde = '#1e6b2e';
  const verdeClaro = '#e8f5e9';

  async function forzarActualizacion() {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) await reg.unregister();
      }
      if ('caches' in window) {
        const nombres = await caches.keys();
        await Promise.all(nombres.map(n => caches.delete(n)));
      }
      // Cache-buster URL
      const url = window.location.origin + '/?_refresh=' + Date.now();
      window.location.replace(url);
    } catch (e) {
      window.location.reload();
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f0f4f0',
      fontFamily: 'system-ui, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      position: 'relative',
    }}>

      {/* BOTÓN REFRESCAR (arriba a la derecha) */}
      <button 
        onClick={forzarActualizacion} 
        title="Actualizar app - fuerza descargar última versión"
        style={{
          position: 'absolute', top: 12, right: 12,
          padding: '8px 12px', borderRadius: 20,
          backgroundColor: 'rgba(255,255,255,0.9)',
          border: '1.5px solid rgba(255,255,255,0.4)',
          color: verde, cursor: 'pointer', fontSize: 15, zIndex: 10,
          boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
          fontWeight: 700,
        }}
      >🔄 Actualizar</button>

      {/* HEADER */}
      <div style={{
        width: '100%',
        backgroundColor: verde,
        padding: '24px 16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
      }}>
        {/* ESCUDO */}
        <img
          src="/escudo.jpg"
          alt="Escudo IES Gregorio Prieto"
          style={{
            width: 110,
            height: 110,
            borderRadius: '50%',
            border: '3px solid rgba(255,255,255,0.4)',
            objectFit: 'cover',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          }}
        />
        <div style={{ textAlign: 'center', color: 'white' }}>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 0.5 }}>
            IES Gregorio Prieto
          </div>
          <div style={{ fontSize: 14, opacity: 0.85, marginTop: 4 }}>
            · Respeto · Esfuerzo · Superación ·
          </div>
        </div>
      </div>

      {/* CONTENIDO */}
      <div style={{ maxWidth: 480, width: '100%', padding: '32px 16px', flex: 1 }}>

        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: verde }}>
            Portal de gestión del centro
          </div>
          <div style={{ fontSize: 14, color: '#888', marginTop: 6 }}>
            ¿Quién eres?
          </div>
        </div>

        {/* TARJETA PROFESORES */}
        <a href="/login" style={{ textDecoration: 'none' }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: 16,
            padding: 28,
            marginBottom: 16,
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
            border: `2px solid ${verde}`,
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              backgroundColor: verdeClaro,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 32, flexShrink: 0,
            }}>👨‍🏫</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: verde, marginBottom: 4 }}>
                Soy Profesor/a
              </div>
              <div style={{ fontSize: 14, color: '#666', lineHeight: 1.4 }}>
                Accede al portal para gestionar incidencias, guardias, DLD y más
              </div>
            </div>
            <div style={{ marginLeft: 'auto', fontSize: 22, color: verde }}>→</div>
          </div>
        </a>

        {/* TARJETA ALUMNOS */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: 16,
          padding: 28,
          marginBottom: 32,
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          border: '2px solid #e0e0e0',
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          opacity: 0.7,
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            backgroundColor: '#f5f5f5',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32, flexShrink: 0,
          }}>🎒</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#aaa', marginBottom: 4 }}>
              Soy Alumno/a
            </div>
            <div style={{ fontSize: 14, color: '#bbb', lineHeight: 1.4 }}>
              Área de alumnos — próximamente disponible
            </div>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 13, color: '#bbb', fontWeight: 600 }}>
            Próximo
          </div>
        </div>

        {/* INFO DEL CENTRO */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: 14,
          padding: 20,
          boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
          borderLeft: `4px solid ${verde}`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: verde, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
            Información del centro
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 14, color: '#555', display: 'flex', gap: 10 }}>
              <span>📍</span>
              <span>Calle Prieto, s/n — Valdepeñas, Ciudad Real</span>
            </div>
            <div style={{ fontSize: 14, color: '#555', display: 'flex', gap: 10 }}>
              <span>📞</span>
              <span>926 31 25 00</span>
            </div>
            <div style={{ fontSize: 14, color: '#555', display: 'flex', gap: 10 }}>
              <span>✉️</span>
              <span>13004958@educastillalamancha.es</span>
            </div>
            <div style={{ fontSize: 14, color: '#555', display: 'flex', gap: 10 }}>
              <span>🌐</span>
              <span>iesgregorioprieto.centros.castillalamancha.es</span>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div style={{
        width: '100%', padding: '16px', textAlign: 'center',
        fontSize: 12, color: '#aaa', borderTop: '1px solid #e5e5e5',
        backgroundColor: 'white'
      }}>
        © 2026 IES Gregorio Prieto · Valdepeñas · Castilla-La Mancha
      </div>
    </div>
  );
}