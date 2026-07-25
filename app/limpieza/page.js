'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// Cliente Supabase específico del proyecto de LIMPIEZA (NO usar getSupabase principal)
const supaLimpieza = createClient(
  'https://wtxgisivjvxhcvnjsrxp.supabase.co',
  'sb_publishable_AeaFJyjgL1nG2DmaYFlIcQ_Uk57OCT8'
);

const azul = '#0891b2';
const azulOscuro = '#155e75';
const azulClaro = '#ecfeff';
const verde = '#1e6b2e';
const rojo = '#b91c1c';

// Detecta el tipo de dependencia por su nombre para mostrar los tipos de incidencia adecuados
function detectarTipoDep(nombre) {
  const n = (nombre||'').toLowerCase();
  if (n.includes('baño') || n.includes('bano') || n.includes('aseo') || n.includes('wc') || n.includes('lavabo')) return 'BANO';
  if (n.includes('escalera')) return 'ESCALERA';
  if (n.includes('patio') || n.includes('jardín') || n.includes('jardin')) return 'PATIO';
  if (n.includes('laboratorio')) return 'LABORATORIO';
  if (n.includes('taller')) return 'TALLER';
  if (n.includes('departamento') || n.includes('sala prof')) return 'DEPARTAMENTO';
  if (n.includes('aula') || n.includes('clase') || n.includes('informática') || n.includes('informatica') || n.includes('ateca') || n.includes('tecnología') || n.includes('tecnologia')) return 'AULA';
  return 'GENERICO';
}

// Reportes rápidos según tipo de dependencia
const REPORTES_POR_TIPO = {
  BANO: [
    { emoji: '🧻', txt: 'Falta papel higiénico' },
    { emoji: '🧼', txt: 'Falta jabón' },
    { emoji: '💧', txt: 'Grifo/inodoro con problemas' },
    { emoji: '🚽', txt: 'Muy sucio' },
    { emoji: '🗑️', txt: 'Papelera llena' },
    { emoji: '💡', txt: 'Luz fundida' },
  ],
  AULA: [
    { emoji: '🧽', txt: 'Pizarra sin limpiar' },
    { emoji: '🗑️', txt: 'Papelera llena' },
    { emoji: '🧹', txt: 'Suelo muy sucio' },
    { emoji: '🪑', txt: 'Mesas/sillas por ordenar' },
    { emoji: '💡', txt: 'Luz fundida' },
  ],
  TALLER: [
    { emoji: '🧹', txt: 'Suelo con restos' },
    { emoji: '🗑️', txt: 'Papeleras llenas' },
    { emoji: '🧽', txt: 'Bancos de trabajo sucios' },
    { emoji: '💡', txt: 'Luz fundida' },
  ],
  LABORATORIO: [
    { emoji: '🧪', txt: 'Restos de material' },
    { emoji: '🗑️', txt: 'Papelera llena' },
    { emoji: '🧽', txt: 'Mesas sucias' },
    { emoji: '💡', txt: 'Luz fundida' },
  ],
  DEPARTAMENTO: [
    { emoji: '🧹', txt: 'Suelo sucio' },
    { emoji: '🗑️', txt: 'Papelera llena' },
    { emoji: '🧽', txt: 'Superficies polvorientas' },
  ],
  ESCALERA: [
    { emoji: '🧹', txt: 'Escalones sucios' },
    { emoji: '🚧', txt: 'Barandilla suelta' },
    { emoji: '💡', txt: 'Luz fundida' },
  ],
  PATIO: [
    { emoji: '🗑️', txt: 'Papelera llena' },
    { emoji: '🍂', txt: 'Muy sucio (hojas/basura)' },
    { emoji: '🚧', txt: 'Desperfecto' },
  ],
  GENERICO: [
    { emoji: '🧹', txt: 'Sucio' },
    { emoji: '🗑️', txt: 'Papelera llena' },
    { emoji: '💡', txt: 'Luz fundida' },
    { emoji: '🚧', txt: 'Desperfecto' },
  ],
};

export default function Limpieza() {
  const [nombreProfesor, setNombreProfesor] = useState('');
  const [profesorId, setProfesorId] = useState('');
  
  // Flujo: 'inicio' → 'escaneando' → 'formulario' → 'enviando' → 'enviado' | 'error'
  const [pantalla, setPantalla] = useState('inicio');
  
  const [dependencia, setDependencia] = useState(null);
  const [errorMensaje, setErrorMensaje] = useState('');
  
  const [problemasSeleccionados, setProblemasSeleccionados] = useState([]);
  const [descripcion, setDescripcion] = useState('');
  const [entradaManual, setEntradaManual] = useState('');
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animRef = useRef(null);
  const jsQRRef = useRef(null);

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    if (!id) { window.location.href = '/login'; return; }
    setProfesorId(id);
    setNombreProfesor(sessionStorage.getItem('profesor_nombre') || '');
    
    // Cargar jsQR desde CDN
    if (typeof window !== 'undefined' && !window.jsQR) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.js';
      script.onload = () => { jsQRRef.current = window.jsQR; };
      document.head.appendChild(script);
    } else if (window.jsQR) {
      jsQRRef.current = window.jsQR;
    }
    
    return () => {
      pararCamara();
    };
  }, []);

  function pararCamara() {
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }

  async function iniciarEscaneo() {
    setPantalla('escaneando');
    setErrorMensaje('');
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        escanearFrame();
      }
    } catch (e) {
      console.error('Error cámara:', e);
      setErrorMensaje('No se pudo acceder a la cámara. Puedes introducir el código manualmente abajo.');
      setPantalla('inicio');
    }
  }

  function escanearFrame() {
    if (!videoRef.current || !canvasRef.current || !jsQRRef.current) {
      animRef.current = requestAnimationFrame(escanearFrame);
      return;
    }
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQRRef.current(imageData.data, imageData.width, imageData.height);
        
        if (code && code.data) {
          procesarQR(code.data);
          return;
        }
      } catch (e) {
        console.warn('Error escaneando:', e);
      }
    }
    
    animRef.current = requestAnimationFrame(escanearFrame);
  }

  async function procesarQR(data) {
    pararCamara();
    
    if (!data.startsWith('IES_DEP_')) {
      setErrorMensaje('El código escaneado no es un QR de dependencia del IES. Debe empezar por "IES_DEP_".');
      setPantalla('inicio');
      return;
    }
    
    const uuid = data.replace('IES_DEP_', '');
    await cargarDependencia(uuid);
  }

  async function cargarDependencia(uuid) {
    try {
      const { data, error } = await supaLimpieza
        .from('limpieza_dependencias')
        .select('id, nombre, sector_id, limpieza_sectores(nombre)');
      
      if (error) {
        console.error('Error consulta:', error);
        setErrorMensaje('No se pudo conectar con el sistema de limpieza. Prueba de nuevo.');
        setPantalla('inicio');
        return;
      }
      
      const dep = (data || []).find(d => d.id === uuid);
      if (!dep) {
        setErrorMensaje('Esta dependencia no está registrada en el sistema de limpieza. Contacta con secretaría.');
        setPantalla('inicio');
        return;
      }
      
      setDependencia(dep);
      setProblemasSeleccionados([]);
      setDescripcion('');
      setPantalla('formulario');
    } catch (e) {
      console.error('Error:', e);
      setErrorMensaje('Error consultando la dependencia: ' + e.message);
      setPantalla('inicio');
    }
  }

  function entradaManualSubmit() {
    const valor = entradaManual.trim();
    if (!valor) return;
    let uuid = valor;
    if (valor.startsWith('IES_DEP_')) uuid = valor.replace('IES_DEP_', '');
    cargarDependencia(uuid);
    setEntradaManual('');
  }

  function toggleProblema(txt) {
    setProblemasSeleccionados(prev =>
      prev.includes(txt) ? prev.filter(p => p !== txt) : [...prev, txt]
    );
  }

  async function enviarIncidencia() {
    if (problemasSeleccionados.length === 0 && !descripcion.trim()) {
      alert('Selecciona al menos un tipo de problema o escribe una descripción.');
      return;
    }
    
    setPantalla('enviando');
    
    // Componer descripción final
    const partes = [];
    if (problemasSeleccionados.length > 0) partes.push(problemasSeleccionados.join(' · '));
    if (descripcion.trim()) partes.push(descripcion.trim());
    const textoFinal = partes.join(' — ');
    
    try {
      const { error } = await supaLimpieza.from('limpieza_incidencias').insert({
        dependencia_id: dependencia.id,
        sector_id: dependencia.sector_id || null,
        reportado_por_tipo: 'profesor',
        reportado_por_nombre: nombreProfesor,
        descripcion: textoFinal,
        fecha: new Date().toISOString().split('T')[0],
      });
      
      if (error) {
        console.error('Error insertando:', error);
        setErrorMensaje('No se pudo enviar la incidencia: ' + error.message);
        setPantalla('error');
        return;
      }
      
      setPantalla('enviado');
    } catch (e) {
      console.error('Error:', e);
      setErrorMensaje('Error enviando: ' + e.message);
      setPantalla('error');
    }
  }

  function volverInicio() {
    setPantalla('inicio');
    setDependencia(null);
    setProblemasSeleccionados([]);
    setDescripcion('');
    setErrorMensaje('');
    pararCamara();
  }

  const tipoDep = dependencia ? detectarTipoDep(dependencia.nombre) : 'GENERICO';
  const reportesRapidos = REPORTES_POR_TIPO[tipoDep] || REPORTES_POR_TIPO.GENERICO;

  return (
    <div style={{ minHeight:'100vh', backgroundColor:'#f9fafb', fontFamily:'system-ui,sans-serif', paddingBottom:60 }}>
      {/* HEADER */}
      <div style={{ backgroundColor:azul, color:'white', padding:'14px 18px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={() => window.location.href = '/profesor'} style={{ backgroundColor:'transparent', border:'none', color:'white', cursor:'pointer', fontSize:20 }}>←</button>
          <div>
            <div style={{ fontSize:15, fontWeight:800 }}>🧹 Incidencia de limpieza</div>
            <div style={{ fontSize:11, opacity:0.9 }}>{nombreProfesor}</div>
          </div>
        </div>
      </div>

      <div style={{ padding:16, maxWidth:600, margin:'0 auto' }}>
        
        {/* PANTALLA INICIO */}
        {pantalla === 'inicio' && (
          <>
            {errorMensaje && (
              <div style={{ backgroundColor:'#fef2f2', border:'1.5px solid #fca5a5', borderRadius:10, padding:12, marginBottom:16, color:rojo, fontSize:13 }}>
                ⚠️ {errorMensaje}
              </div>
            )}
            
            <div style={{ backgroundColor:'white', borderRadius:14, padding:20, textAlign:'center', boxShadow:'0 1px 3px rgba(0,0,0,0.08)' }}>
              <div style={{ fontSize:56, marginBottom:12 }}>📱</div>
              <div style={{ fontSize:16, fontWeight:800, color:azulOscuro, marginBottom:6 }}>
                Escanea el QR de la dependencia
              </div>
              <div style={{ fontSize:13, color:'#666', marginBottom:20, lineHeight:1.5 }}>
                Apunta la cámara al código QR pegado en la puerta del baño, aula o taller donde has visto el problema.
              </div>
              <button
                onClick={iniciarEscaneo}
                style={{
                  padding:'14px 28px', borderRadius:12, border:'none',
                  backgroundColor:azul, color:'white', fontSize:15, fontWeight:800, cursor:'pointer',
                  boxShadow:'0 2px 8px rgba(8, 145, 178, 0.4)',
                }}
              >📷 Abrir cámara</button>
            </div>

            <div style={{ backgroundColor:'#f3f4f6', borderRadius:10, padding:14, marginTop:16 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#555', marginBottom:8 }}>
                ¿La cámara no funciona? Introduce el código manualmente:
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <input
                  type="text"
                  value={entradaManual}
                  onChange={e => setEntradaManual(e.target.value)}
                  placeholder="IES_DEP_..."
                  style={{ flex:1, padding:'8px 12px', borderRadius:8, border:'1px solid #d1d5db', fontSize:13 }}
                />
                <button
                  onClick={entradaManualSubmit}
                  disabled={!entradaManual.trim()}
                  style={{
                    padding:'8px 16px', borderRadius:8, border:'none',
                    backgroundColor: entradaManual.trim() ? azul : '#d1d5db',
                    color:'white', fontSize:13, fontWeight:700, cursor: entradaManual.trim() ? 'pointer' : 'not-allowed',
                  }}
                >Ir</button>
              </div>
            </div>
          </>
        )}

        {/* PANTALLA ESCANEANDO */}
        {pantalla === 'escaneando' && (
          <div style={{ backgroundColor:'white', borderRadius:14, padding:16, boxShadow:'0 1px 3px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize:14, fontWeight:700, color:azulOscuro, marginBottom:12, textAlign:'center' }}>
              Apunta al código QR
            </div>
            <div style={{ position:'relative', borderRadius:12, overflow:'hidden', backgroundColor:'#000' }}>
              <video ref={videoRef} playsInline style={{ width:'100%', display:'block' }} />
              <canvas ref={canvasRef} style={{ display:'none' }} />
              {/* Marco de guía */}
              <div style={{
                position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none',
              }}>
                <div style={{
                  width:'70%', aspectRatio:'1/1', border:'3px solid rgba(255,255,255,0.8)', borderRadius:16,
                  boxShadow:'0 0 0 9999px rgba(0,0,0,0.35)',
                }} />
              </div>
            </div>
            <button
              onClick={volverInicio}
              style={{
                marginTop:14, padding:'10px 20px', width:'100%', borderRadius:10, border:'1.5px solid #d1d5db',
                backgroundColor:'white', color:'#555', fontSize:14, fontWeight:700, cursor:'pointer',
              }}
            >Cancelar</button>
          </div>
        )}

        {/* PANTALLA FORMULARIO */}
        {pantalla === 'formulario' && dependencia && (
          <>
            <div style={{ backgroundColor:azulClaro, border:'2px solid ' + azul, borderRadius:12, padding:14, marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:azulOscuro, opacity:0.85, marginBottom:2 }}>📍 DEPENDENCIA</div>
              <div style={{ fontSize:17, fontWeight:800, color:azulOscuro }}>{dependencia.nombre}</div>
              {dependencia.limpieza_sectores?.nombre && (
                <div style={{ fontSize:12, color:azulOscuro, opacity:0.8, marginTop:2 }}>
                  Sector: {dependencia.limpieza_sectores.nombre}
                </div>
              )}
            </div>

            <div style={{ backgroundColor:'white', borderRadius:12, padding:16, marginBottom:14, boxShadow:'0 1px 3px rgba(0,0,0,0.08)' }}>
              <div style={{ fontSize:13, fontWeight:800, color:'#333', marginBottom:10 }}>
                ¿Qué has visto? <span style={{ fontWeight:400, color:'#666', fontSize:12 }}>(puedes marcar varios)</span>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {reportesRapidos.map((r, i) => {
                  const activo = problemasSeleccionados.includes(r.txt);
                  return (
                    <button
                      key={i}
                      onClick={() => toggleProblema(r.txt)}
                      style={{
                        padding:'8px 14px', borderRadius:20, border:'1.5px solid ' + (activo ? azul : '#d1d5db'),
                        backgroundColor: activo ? azulClaro : 'white',
                        color: activo ? azulOscuro : '#555', fontSize:13, fontWeight:700, cursor:'pointer',
                        display:'flex', alignItems:'center', gap:6,
                      }}
                    >
                      <span>{r.emoji}</span>
                      <span>{r.txt}</span>
                      {activo && <span style={{ marginLeft:4 }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ backgroundColor:'white', borderRadius:12, padding:16, marginBottom:14, boxShadow:'0 1px 3px rgba(0,0,0,0.08)' }}>
              <div style={{ fontSize:13, fontWeight:800, color:'#333', marginBottom:8 }}>
                Descripción adicional <span style={{ fontWeight:400, color:'#666', fontSize:12 }}>(opcional)</span>
              </div>
              <textarea
                value={descripcion}
                onChange={e => setDescripcion(e.target.value)}
                placeholder="Añade detalles del problema si lo necesitas..."
                rows={3}
                style={{
                  width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid #d1d5db',
                  fontSize:14, fontFamily:'inherit', resize:'vertical', boxSizing:'border-box',
                }}
              />
            </div>

            <div style={{ display:'flex', gap:8 }}>
              <button
                onClick={volverInicio}
                style={{
                  padding:'12px 20px', borderRadius:10, border:'1.5px solid #d1d5db',
                  backgroundColor:'white', color:'#555', fontSize:14, fontWeight:700, cursor:'pointer',
                }}
              >Cancelar</button>
              <button
                onClick={enviarIncidencia}
                style={{
                  flex:1, padding:'12px 20px', borderRadius:10, border:'none',
                  backgroundColor: azul, color:'white', fontSize:15, fontWeight:800, cursor:'pointer',
                  boxShadow:'0 2px 8px rgba(8, 145, 178, 0.4)',
                }}
              >📤 Enviar incidencia</button>
            </div>
          </>
        )}

        {/* PANTALLA ENVIANDO */}
        {pantalla === 'enviando' && (
          <div style={{ backgroundColor:'white', borderRadius:14, padding:30, textAlign:'center', boxShadow:'0 1px 3px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize:40, marginBottom:12 }}>⏳</div>
            <div style={{ fontSize:14, color:'#666' }}>Enviando incidencia al equipo de limpieza…</div>
          </div>
        )}

        {/* PANTALLA ENVIADO ✅ */}
        {pantalla === 'enviado' && (
          <div style={{
            backgroundColor:'#dcfce7', border:'2px solid ' + verde, borderRadius:14,
            padding:24, textAlign:'center', boxShadow:'0 2px 12px rgba(30, 107, 46, 0.15)',
          }}>
            <div style={{ fontSize:56, marginBottom:12 }}>✅</div>
            <div style={{ fontSize:16, fontWeight:800, color:verde, marginBottom:6 }}>
              Incidencia enviada
            </div>
            <div style={{ fontSize:13, color:'#166534', marginBottom:20, lineHeight:1.5 }}>
              El equipo de limpieza recibirá el aviso sobre <strong>{dependencia?.nombre}</strong>. Gracias por avisar 👍
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
              <button
                onClick={volverInicio}
                style={{
                  padding:'10px 20px', borderRadius:10, border:'none',
                  backgroundColor:azul, color:'white', fontSize:14, fontWeight:700, cursor:'pointer',
                }}
              >Reportar otra</button>
              <button
                onClick={() => window.location.href = '/profesor'}
                style={{
                  padding:'10px 20px', borderRadius:10, border:'1.5px solid #d1d5db',
                  backgroundColor:'white', color:'#555', fontSize:14, fontWeight:700, cursor:'pointer',
                }}
              >Volver al inicio</button>
            </div>
          </div>
        )}

        {/* PANTALLA ERROR */}
        {pantalla === 'error' && (
          <div style={{
            backgroundColor:'#fef2f2', border:'2px solid #fca5a5', borderRadius:14, padding:24, textAlign:'center',
          }}>
            <div style={{ fontSize:56, marginBottom:12 }}>❌</div>
            <div style={{ fontSize:16, fontWeight:800, color:rojo, marginBottom:6 }}>No se pudo enviar</div>
            <div style={{ fontSize:13, color:'#7f1d1d', marginBottom:20, lineHeight:1.5 }}>
              {errorMensaje}
            </div>
            <button
              onClick={() => setPantalla('formulario')}
              style={{
                padding:'10px 20px', borderRadius:10, border:'none',
                backgroundColor:azul, color:'white', fontSize:14, fontWeight:700, cursor:'pointer',
              }}
            >Reintentar</button>
          </div>
        )}
      </div>
    </div>
  );
}
