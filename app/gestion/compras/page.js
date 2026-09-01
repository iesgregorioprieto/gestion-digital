'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { SeccionCompras } from '@/components/SeccionesSolicitudes';

export default function PaginaSolicitudes() {
  const [nombreUsuario, setNombreUsuario] = useState('');
    const [compras, setCompras] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroDpto, setFiltroDpto] = useState('');
  const [filtroProveedor, setFiltroProveedor] = useState('');
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');
  const [compraAbierta, setCompraAbierta] = useState(null);
  const [comentario, setComentario] = useState('');
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    if (!id) { window.location.href = '/login'; return; }
    setNombreUsuario(sessionStorage.getItem('profesor_nombre') || '');
  }, []);

  function cerrarSesion() {
    fetch('/api/auth', { method: 'DELETE' }).finally(() => {
      sessionStorage.clear();
      window.location.href = '/login';
    });
  }

  const verde = '#1e6b2e';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      {/* HEADER */}
      <div style={{ backgroundColor: verde, color: 'white', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>🛒 Compras</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>IES Gregorio Prieto · {nombreUsuario}</div>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <a href="/gestion" style={{ color: 'white', textDecoration: 'none', fontSize: 14 }}>← Inicio</a>
          <button onClick={cerrarSesion} style={{
            padding: '7px 14px', borderRadius: 8, border: '1.5px solid rgba(255,255,255,0.4)',
            backgroundColor: 'transparent', color: 'white', cursor: 'pointer', fontSize: 13
          }}>🚪 Salir</button>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
        <SeccionCompras
          compras={compras} setCompras={setCompras}
          cargando={cargando} setCargando={setCargando}
          filtroEstado={filtroEstado} setFiltroEstado={setFiltroEstado}
          filtroDpto={filtroDpto} setFiltroDpto={setFiltroDpto}
          filtroProveedor={filtroProveedor} setFiltroProveedor={setFiltroProveedor}
          filtroDesde={filtroDesde} setFiltroDesde={setFiltroDesde}
          filtroHasta={filtroHasta} setFiltroHasta={setFiltroHasta}
          compraAbierta={compraAbierta} setCompraAbierta={setCompraAbierta}
          comentario={comentario} setComentario={setComentario}
          procesando={procesando} setProcesando={setProcesando}
        />
      </div>
    </div>
  );
}
