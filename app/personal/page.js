'use client';
export const dynamic = 'force-dynamic';

const cyan = '#0891b2';
const cyanClaro = '#ecfeff';
const cyanOscuro = '#155e75';

const ROLES = [
  {
    id: 'limpieza',
    emoji: '🧹',
    titulo: 'Soy Personal de Limpieza',
    descripcion: 'Registra tu jornada, sectores y comunicaciones del equipo',
    href: '/personal/limpieza',
    disponible: true,
    color: cyan,
    bg: cyanClaro,
    border: cyan,
  },
  {
    id: 'conserjeria',
    emoji: '🧾',
    titulo: 'Soy Conserje',
    descripcion: 'Próximamente',
    href: '#',
    disponible: false,
    color: '#aaa',
    bg: '#f5f5f5',
    border: '#e0e0e0',
  },
];

export default function Personal() {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f0f4f6',
      fontFamily: 'system-ui, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}>
      {/* HEADER */}
      <div style={{
        width: '100%',
        backgroundColor: cyan,
        padding: '20px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        color: 'white',
      }}>
        <a href="/" style={{ color: 'white', textDecoration: 'none', fontSize: 20, padding: '4px 10px', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 8 }}>← Volver</a>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>🧹 Soy Personal Laboral</div>
          <div style={{ fontSize: 12, opacity: 0.9 }}>IES Gregorio Prieto</div>
        </div>
      </div>

      {/* CONTENIDO */}
      <div style={{ maxWidth: 520, width: '100%', padding: '32px 16px', flex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: cyanOscuro }}>
            ¿Qué tipo de personal eres?
          </div>
          <div style={{ fontSize: 13, color: '#888', marginTop: 6 }}>
            Elige tu área para acceder a tu herramienta
          </div>
        </div>

        {ROLES.map(rol => {
          const contenido = (
            <div style={{
              backgroundColor: 'white',
              borderRadius: 14,
              padding: 22,
              marginBottom: 14,
              boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
              border: `2px solid ${rol.border}`,
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              cursor: rol.disponible ? 'pointer' : 'not-allowed',
              opacity: rol.disponible ? 1 : 0.6,
              transition: 'all 0.15s',
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                backgroundColor: rol.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 28, flexShrink: 0,
              }}>{rol.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: rol.color, marginBottom: 3 }}>
                  {rol.titulo}
                </div>
                <div style={{ fontSize: 13, color: '#666', lineHeight: 1.35 }}>
                  {rol.descripcion}
                </div>
              </div>
              {rol.disponible ? (
                <div style={{ fontSize: 22, color: rol.color }}>→</div>
              ) : (
                <div style={{ fontSize: 12, color: '#bbb', fontWeight: 700 }}>Próximo</div>
              )}
            </div>
          );

          return rol.disponible ? (
            <a key={rol.id} href={rol.href} style={{ textDecoration: 'none' }}>
              {contenido}
            </a>
          ) : (
            <div key={rol.id}>{contenido}</div>
          );
        })}
      </div>

      {/* FOOTER */}
      <div style={{
        width: '100%', padding: '14px', textAlign: 'center',
        fontSize: 11, color: '#aaa', borderTop: '1px solid #e5e5e5',
        backgroundColor: 'white'
      }}>
        © 2026 IES Gregorio Prieto · Valdepeñas
      </div>
    </div>
  );
}
