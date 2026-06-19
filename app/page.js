'use client';
import { useRouter } from 'next/navigation';

const ESCUDO_BASE64 = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTIwIj48cGF0aCBkPSJNNTAgMkw5NiAyMHY0MGMwIDMwLTIwIDUwLTQ2IDU4QzQgMTEwIDQgOTAgNCAxMFYyMHoiIGZpbGw9IiMyRTcwMjMiLz48dGV4dCB4PSI1MCIgeT0iNTUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IndoaXRlIiBmb250LXNpemU9IjE0IiBmb250LXdlaWdodD0iYm9sZCI+SUFTPC90ZXh0Pjx0ZXh0IHg9IjUwIiB5PSI3NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iI2ZmZDcwMCIgZm9udC1zaXplPSI4Ij5HUkVHT1JJTzwvdGV4dD48dGV4dCB4PSI1MCIgeT0iODgiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiNmZmQ3MDAiIGZvbnQtc2l6ZT0iOCI+UFJJRVRVPC90ZXh0Pjwvc3ZnPg==`;

export default function Home() {
  const router = useRouter();

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', background: '#f0f4f0' }}>
      <header style={{ background: '#2E7023', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
        <img src={ESCUDO_BASE64} alt="Escudo IES" style={{ height: '56px' }} />
        <div>
          <h1 style={{ margin: 0, color: 'white', fontSize: '20px', fontWeight: 'bold' }}>IES Gregorio Prieto</h1>
          <p style={{ margin: 0, color: '#8DC63F', fontSize: '13px' }}>Respeto · Esfuerzo · Superación</p>
        </div>
      </header>

      <section style={{ background: 'linear-gradient(135deg, #2E7023 0%, #5A9E30 60%, #8DC63F 100%)', padding: '60px 24px', textAlign: 'center' }}>
        <img src={ESCUDO_BASE64} alt="Escudo" style={{ height: '100px', marginBottom: '20px' }} />
        <h2 style={{ color: 'white', fontSize: '28px', margin: '0 0 12px' }}>Portal Digital del Centro</h2>
        <p style={{ color: '#d4edda', fontSize: '16px', margin: 0 }}>Valdepeñas · Castilla-La Mancha</p>
      </section>

      <section style={{ padding: '48px 24px', maxWidth: '600px', margin: '0 auto' }}>
        <p style={{ textAlign: 'center', color: '#555', marginBottom: '32px', fontSize: '17px' }}>¿Quién eres?</p>
        <div style={{ display: 'flex', gap: '24px', justifyContent: 'center', flexWrap: 'wrap' }}>

          <div style={{ background: 'white', borderRadius: '16px', padding: '36px 32px', textAlign: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', flex: '1', minWidth: '200px', maxWidth: '240px' }}>
            <div style={{ fontSize: '56px', marginBottom: '16px' }}>🎒</div>
            <h3 style={{ color: '#2E7023', margin: '0 0 12px', fontSize: '18px' }}>Soy Alumno/a</h3>
            <p style={{ color: '#888', fontSize: '13px', marginBottom: '20px' }}>Accede a tus calificaciones y tareas</p>
            <button style={{ background: '#e8f5e9', color: '#2E7023', border: '2px solid #2E7023', borderRadius: '8px', padding: '10px 24px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
              onClick={() => alert('Módulo de alumnos próximamente')}>
              Entrar
            </button>
          </div>

          <div style={{ background: '#2E7023', borderRadius: '16px', padding: '36px 32px', textAlign: 'center', boxShadow: '0 4px 16px rgba(46,112,35,0.4)', flex: '1', minWidth: '200px', maxWidth: '240px' }}>
            <div style={{ fontSize: '56px', marginBottom: '16px' }}>👩‍🏫</div>
            <h3 style={{ color: 'white', margin: '0 0 12px', fontSize: '18px' }}>Soy Profesor/a</h3>
            <p style={{ color: '#c8e6c9', fontSize: '13px', marginBottom: '20px' }}>Regístrate o accede a tu panel</p>
            <button style={{ background: 'white', color: '#2E7023', border: 'none', borderRadius: '8px', padding: '10px 24px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
              onClick={() => router.push('/registro')}>
              Registrarse
            </button>
          </div>

        </div>
      </section>

      <section style={{ background: 'white', padding: '32px 24px', textAlign: 'center', borderTop: '1px solid #e0e0e0' }}>
        <p style={{ color: '#666', margin: '4px 0' }}>📍 Valdepeñas, Ciudad Real · Castilla-La Mancha</p>
        <p style={{ color: '#666', margin: '4px 0' }}>📞 926 31 00 00</p>
        <p style={{ color: '#666', margin: '4px 0' }}>✉️ secretario@somosdelprieto.com</p>
      </section>

      <footer style={{ background: '#2E7023', color: 'white', textAlign: 'center', padding: '16px', fontSize: '13px' }}>
        © 2025 IES Gregorio Prieto · Todos los derechos reservados
      </footer>
    </div>
  );
}