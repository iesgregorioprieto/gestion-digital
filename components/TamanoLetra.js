'use client';

import { useState, useEffect } from 'react';

const VERDE = '#1e6b2e';
const CLAVE = 'ies-tamano-letra';

const TAMANOS = [
  { valor: '0.9',  etiqueta: 'Pequeño',     muestra: 13, descripcion: 'Cabe más en pantalla' },
  { valor: '1',    etiqueta: 'Normal',      muestra: 15, descripcion: 'Tamaño por defecto' },
  { valor: '1.15', etiqueta: 'Grande',      muestra: 17, descripcion: 'Más cómodo de leer' },
  { valor: '1.3',  etiqueta: 'Muy grande',  muestra: 19, descripcion: 'Máxima legibilidad' },
];

export default function TamanoLetra() {
  const [actual, setActual] = useState('1');
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    try {
      const z = localStorage.getItem(CLAVE);
      if (z) setActual(z);
    } catch (_) {}
  }, []);

  function aplicar(valor) {
    setActual(valor);
    try {
      localStorage.setItem(CLAVE, valor);
      document.documentElement.style.zoom = valor === '1' ? '' : valor;
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
    } catch (_) {}
  }

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#333', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid #eee' }}>
        🔠 Tamaño de la letra
      </div>

      <div style={{ fontSize: 13.5, color: '#555', lineHeight: 1.6, marginBottom: 16 }}>
        Elige el tamaño con el que mejor leas. El cambio se aplica al momento
        y se recuerda en este dispositivo.
      </div>

      <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
        {TAMANOS.map(t => {
          const activo = actual === t.valor;
          return (
            <div
              key={t.valor}
              onClick={() => aplicar(t.valor)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                border: `2px solid ${activo ? VERDE : '#e5e7eb'}`,
                backgroundColor: activo ? '#f0fdf4' : 'white',
                transition: 'all 0.15s',
              }}
            >
              <div style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                border: `2px solid ${activo ? VERDE : '#ccc'}`,
                backgroundColor: activo ? VERDE : 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontSize: 13, fontWeight: 700,
              }}>
                {activo ? '✓' : ''}
              </div>

              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: t.muestra, fontWeight: 700,
                  color: activo ? VERDE : '#333', marginBottom: 2,
                }}>
                  {t.etiqueta}
                </div>
                <div style={{ fontSize: 12, color: '#888' }}>
                  {t.descripcion}
                </div>
              </div>

              <div style={{ fontSize: t.muestra + 4, color: '#bbb', fontWeight: 700 }}>
                Aa
              </div>
            </div>
          );
        })}
      </div>

      {guardado && (
        <div style={{
          backgroundColor: '#dcfce7', border: '1.5px solid #86efac', color: '#166534',
          borderRadius: 10, padding: '11px 16px', fontSize: 13, fontWeight: 600,
          marginBottom: 14,
        }}>
          ✅ Tamaño guardado
        </div>
      )}

      <div style={{
        backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534',
        borderRadius: 10, padding: '12px 16px', fontSize: 12, lineHeight: 1.7,
      }}>
        💡 También puedes ampliar en cualquier momento haciendo el gesto de
        pellizcar con dos dedos sobre la pantalla.
      </div>
    </div>
  );
}
