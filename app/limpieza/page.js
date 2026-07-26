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
  
  // Historial + duplicados + foto
  const [misIncidencias, setMisIncidencias] = useState([]);
  const [incidenciasAbiertas, setIncidenciasAbiertas] = useState([]);
  const [foto, setFoto] = useState(null); // File object
  const [fotoPreview, setFotoPreview] = useState(null); // URL preview
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animRef = useRef(null);
  const jsQRRef = useRef(null);
  const inputFotoRef = useRef(null);

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    if (!id) { window.location.href = '/login'; return; }
    setProfesorId(id);
    const nombre = sessionStorage.getItem('profesor_nombre') || '';
    setNombreProfesor(nombre);
    
    // Cargar jsQR desde CDN
    if (typeof window !== 'undefined' && !window.jsQR) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.js';
      script.onload = () => { jsQRRef.current = window.jsQR; };
      document.head.appendChild(script);
    } else if (window.jsQR) {
      jsQRRef.current = window.jsQR;
    }
    
    // Cargar mis últimas 3 incidencias
    cargarMisIncidencias(nombre);
    
    return () => {
      pararCamara();
    };
  }, []);
  
  async function cargarMisIncidencias(nombre) {
    if (!nombre) return;
    try {
      const { data } = await supaLimpieza
        .from('limpieza_incidencias')
        .select('id, descripcion, fecha, resuelta, dependencia_id, limpieza_dependencias(nombre)')
        .eq('reportado_por_nombre', nombre)
        .order('fecha', { ascending: false })
        .limit(3);
      setMisIncidencias(data || []);
    } catch(e) { console.warn('Error cargando historial:', e); }
  }

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
      
      // Comprobar incidencias abiertas de esa dependencia (últimos 3 días, no resueltas)
      const hace3dias = new Date();
      hace3dias.setDate(hace3dias.getDate() - 3);
      const fechaDesde = hace3dias.toISOString().split('T')[0];
      
      try {
        const { data: abiertas } = await supaLimpieza
          .from('limpieza_incidencias')
          .select('id, descripcion, fecha, reportado_por_nombre, resuelta')
          .eq('dependencia_id', dep.id)
          .gte('fecha', fechaDesde)
          .order('fecha', { ascending: false });
        // Filtrar solo las no resueltas (resuelta puede ser null, false...)
        const noResueltas = (abiertas || []).filter(a => a.resuelta !== true);
        setIncidenciasAbiertas(noResueltas);
      } catch(e) { console.warn('Error comprobando incidencias:', e); }
      
      setDependencia(dep);
      setProblemasSeleccionados([]);
      setDescripcion('');
      setFoto(null);
      setFotoPreview(null);
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

  function seleccionarFoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Validar que sea imagen y no muy grande (<10MB)
    if (!file.type.startsWith('image/')) {
      alert('Debe ser un archivo de imagen');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('La foto es demasiado grande (máx 10 MB)');
      return;
    }
    setFoto(file);
    const url = URL.createObjectURL(file);
    setFotoPreview(url);
  }

  function quitarFoto() {
    setFoto(null);
    if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    setFotoPreview(null);
    if (inputFotoRef.current) inputFotoRef.current.value = '';
  }

  async function subirFoto() {
    if (!foto) return null;
    setSubiendoFoto(true);
    try {
      const ext = foto.name.split('.').pop() || 'jpg';
      const nombre = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;
      const { data, error } = await supaLimpieza.storage
        .from('limpieza-incidencias-fotos')
        .upload(nombre, foto, { cacheControl: '3600', upsert: false });
      if (error) {
        console.error('Error subiendo foto:', error);
        setSubiendoFoto(false);
        return null;
      }
      const { data: urlData } = supaLimpieza.storage
        .from('limpieza-incidencias-fotos')
        .getPublicUrl(nombre);
      setSubiendoFoto(false);
      return urlData.publicUrl;
    } catch (e) {
      console.error('Error foto:', e);
      setSubiendoFoto(false);
      return null;
    }
  }

  async function enviarIncidencia() {
    if (problemasSeleccionados.length === 0 && !descripcion.trim()) {
      alert('Selecciona al menos un tipo de problema o escribe una descripción.');
      return;
    }
    
    setPantalla('enviando');
    
    // Subir foto si hay
    let fotoUrl = null;
    if (foto) {
      fotoUrl = await subirFoto();
      if (!fotoUrl) {
        // Foto falló pero seguimos con la incidencia sin foto
        console.warn('Foto no se pudo subir, incidencia sin foto');
      }
    }
    
    // Componer descripción final
    const partes = [];
    if (problemasSeleccionados.length > 0) partes.push(problemasSeleccionados.join(' · '));
    if (descripcion.trim()) partes.push(descripcion.trim());
    const textoFinal = partes.join(' — ');
    
    try {
      const insertData = {
        dependencia_id: dependencia.id,
        sector_id: dependencia.sector_id || null,
        reportado_por_tipo: 'profesor',
        reportado_por_nombre: nombreProfesor,
        descripcion: textoFinal,
        fecha: new Date().toISOString().split('T')[0],
      };
      if (fotoUrl) insertData.foto_url = fotoUrl;
      
      const { error } = await supaLimpieza.from('limpieza_incidencias').insert(insertData);
      
      if (error) {
        console.error('Error insertando:', error);
        setErrorMensaje('No se pudo enviar la incidencia: ' + error.message);
        setPantalla('error');
        return;
      }
      
      // Refrescar historial
      cargarMisIncidencias(nombreProfesor);
      
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
    setIncidenciasAbiertas([]);
    quitarFoto();
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
            
            {/* MIS ÚLTIMAS INCIDENCIAS */}
            {misIncidencias.length > 0 && (
              <div style={{ marginTop:20 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#555', marginBottom:8, textTransform:'uppercase', letterSpacing:0.5 }}>
                  📋 Mis últimos reportes
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {misIncidencias.map((inc, i) => (
                    <div key={i} style={{
                      backgroundColor:'white', borderRadius:8, padding:'10px 12px',
                      border:'1px solid #e5e7eb', display:'flex', alignItems:'center', gap:10,
                    }}>
                      <span style={{ fontSize:16 }}>
                        {inc.resuelta ? '✅' : '⏳'}
                      </span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:'#333', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                          {inc.limpieza_dependencias?.nombre || 'Dependencia'}
                        </div>
                        <div style={{ fontSize:10, color:'#666', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                          {inc.descripcion || 'Sin descripción'}
                        </div>
                      </div>
                      <div style={{ fontSize:10, color:'#999', flexShrink:0 }}>
                        {new Date(inc.fecha+'T12:00:00').toLocaleDateString('es-ES', { day:'numeric', month:'short' })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
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

            {/* AVISO DE INCIDENCIAS ABIERTAS */}
            {incidenciasAbiertas.length > 0 && (
              <div style={{
                backgroundColor:'#fef3c7', border:'2px solid #f59e0b', borderRadius:12, padding:14, marginBottom:14,
              }}>
                <div style={{ fontSize:13, fontWeight:800, color:'#78350f', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
                  ⚠️ Ya hay {incidenciasAbiertas.length} incidencia{incidenciasAbiertas.length !== 1 ? 's' : ''} sin resolver aquí
                </div>
                <div style={{ fontSize:11, color:'#92400e', marginBottom:8 }}>
                  Puedes añadir otra si el problema es distinto o simplemente cerrar.
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {incidenciasAbiertas.slice(0, 3).map((inc, i) => (
                    <div key={i} style={{
                      backgroundColor:'white', borderRadius:6, padding:'6px 10px',
                      fontSize:11, border:'1px solid #fde68a',
                    }}>
                      <div style={{ fontWeight:700, color:'#78350f' }}>
                        {inc.descripcion || 'Sin descripción'}
                      </div>
                      <div style={{ fontSize:10, color:'#92400e', marginTop:2 }}>
                        {inc.reportado_por_nombre || 'Anónimo'} · {new Date(inc.fecha+'T12:00:00').toLocaleDateString('es-ES', { day:'numeric', month:'short' })}
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={volverInicio}
                  style={{
                    marginTop:10, width:'100%', padding:'8px 12px', borderRadius:8, border:'1.5px solid #f59e0b',
                    backgroundColor:'white', color:'#78350f', fontSize:12, fontWeight:700, cursor:'pointer',
                  }}
                >← Volver sin reportar (ya hay avisos)</button>
              </div>
            )}

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

            {/* FOTO OPCIONAL */}
            <div style={{ backgroundColor:'white', borderRadius:12, padding:16, marginBottom:14, boxShadow:'0 1px 3px rgba(0,0,0,0.08)' }}>
              <div style={{ fontSize:13, fontWeight:800, color:'#333', marginBottom:10 }}>
                Foto del problema <span style={{ fontWeight:400, color:'#666', fontSize:12 }}>(opcional)</span>
              </div>
              {!fotoPreview ? (
                <>
                  <input
                    ref={inputFotoRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={seleccionarFoto}
                    style={{ display:'none' }}
                  />
                  <button
                    onClick={() => inputFotoRef.current?.click()}
                    style={{
                      width:'100%', padding:'12px', borderRadius:10, border:'1.5px dashed #d1d5db',
                      backgroundColor:'#f9fafb', color:'#555', fontSize:14, fontWeight:700, cursor:'pointer',
                      display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                    }}
                  >📷 Adjuntar foto</button>
                </>
              ) : (
                <div style={{ position:'relative' }}>
                  <img
                    src={fotoPreview}
                    alt="Preview"
                    style={{ width:'100%', maxHeight:250, objectFit:'cover', borderRadius:10, display:'block' }}
                  />
                  <button
                    onClick={quitarFoto}
                    style={{
                      position:'absolute', top:8, right:8, padding:'6px 10px', borderRadius:20, border:'none',
                      backgroundColor:'rgba(0,0,0,0.7)', color:'white', fontSize:12, fontWeight:700, cursor:'pointer',
                    }}
                  >✕ Quitar</button>
                </div>
              )}
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
