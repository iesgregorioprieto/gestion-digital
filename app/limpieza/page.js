'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { hoyLocal } from '@/lib/fechas';
import { createClient } from '@supabase/supabase-js';
import jsQR from 'jsqr';

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
  const [foto, setFoto] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  
  // Estado del escáner (diagnóstico)
  const [estadoScanner, setEstadoScanner] = useState('');
  const [jsQRCargado, setJsQRCargado] = useState(false);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animRef = useRef(null);
  const jsQRRef = useRef(null);
  const inputFotoRef = useRef(null);
  const escaneandoRef = useRef(false); // control loop

  // ── NFC ──
  // Mientras esta página tiene el lector NFC activo, Chrome se queda con
  // la lectura y NO deja que Android abra la app que reclama esa URL.
  // Por eso antes se abría la app de limpieza: aquí no había lector.
  const [nfcDisponible, setNfcDisponible] = useState(false);
  const [leyendoNfc, setLeyendoNfc] = useState(false);
  const nfcAbortRef = useRef(null);

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    if (!id) { window.location.href = '/login'; return; }
    setProfesorId(id);
    const nombre = sessionStorage.getItem('profesor_nombre') || '';
    setNombreProfesor(nombre);
    
    // jsQR disponible como import local — no necesita CDN ni internet
    jsQRRef.current = jsQR;
    setJsQRCargado(true);
    
    // ¿Este móvil puede leer NFC desde el navegador?
    if (typeof window !== 'undefined' && 'NDEFReader' in window) {
      setNfcDisponible(true);
    }

    // BarcodeDetector nativo si disponible (Android Chrome)
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        barcodeDetectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
        console.log('✅ BarcodeDetector nativo disponible');
      } catch(e) {}
    }
    
    cargarMisIncidencias(nombre);
    
    return () => {
      escaneandoRef.current = false;
      pararCamara();
      // Soltar el lector NFC al salir: si no, sigue capturando
      if (nfcAbortRef.current) nfcAbortRef.current.abort();
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
    escaneandoRef.current = false;
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
    setEstadoScanner('Iniciando cámara...');
    
    // Esperar a que jsQR esté cargado (hasta 5 segundos)
    let intentos = 0;
    while (!jsQRRef.current && intentos < 50) {
      await new Promise(r => setTimeout(r, 100));
      intentos++;
    }
    
    if (!jsQRRef.current) {
      setErrorMensaje('No se pudo cargar el lector de QR. Verifica tu conexión a internet.');
      setPantalla('inicio');
      return;
    }
    
    try {
      setEstadoScanner('Solicitando permisos de cámara...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Esperar a que el video pueda reproducirse
        await new Promise((resolve) => {
          if (videoRef.current.readyState >= 2) {
            resolve();
          } else {
            videoRef.current.onloadedmetadata = () => resolve();
          }
        });
        await videoRef.current.play();
        
        // Inicializar BarcodeDetector nativo si disponible
        if ('BarcodeDetector' in window && !barcodeDetectorRef.current) {
          try {
            barcodeDetectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
            console.log('✅ BarcodeDetector nativo listo');
          } catch(e) {}
        }
        
        setEstadoScanner(barcodeDetectorRef.current 
          ? 'Apunta al código QR... (lector nativo activo)' 
          : 'Apunta al código QR...');
        escaneandoRef.current = true;
        escanearFrame();
      }
    } catch (e) {
      console.error('Error cámara:', e);
      let msg = 'No se pudo acceder a la cámara.';
      if (e.name === 'NotAllowedError') {
        msg = 'No se permitió el acceso a la cámara. Debes autorizarla en los ajustes del navegador.';
      } else if (e.name === 'NotFoundError') {
        msg = 'No se detectó ninguna cámara en el dispositivo.';
      } else if (e.name === 'NotReadableError') {
        msg = 'La cámara está siendo usada por otra aplicación. Ciérrala y vuelve a intentar.';
      }
      setErrorMensaje(msg + ' Puedes introducir el código manualmente abajo.');
      setPantalla('inicio');
    }
  }

  // Detector nativo del navegador (muy potente en Android Chrome)
  const barcodeDetectorRef = useRef(null);
  
  useEffect(() => {
    // Intentar usar BarcodeDetector nativo si existe
    if ('BarcodeDetector' in window) {
      try {
        barcodeDetectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
        console.log('✅ BarcodeDetector nativo disponible');
      } catch(e) {
        console.warn('BarcodeDetector no disponible:', e);
      }
    }
  }, []);

  async function escanearFrame() {
    if (!escaneandoRef.current) return;
    if (!videoRef.current) return;
    
    const video = videoRef.current;
    if (video.readyState !== video.HAVE_ENOUGH_DATA || video.videoWidth === 0) {
      animRef.current = requestAnimationFrame(escanearFrame);
      return;
    }

    try {
      // MÉTODO 1: BarcodeDetector nativo (más rápido y fiable en móvil)
      if (barcodeDetectorRef.current) {
        const codes = await barcodeDetectorRef.current.detect(video);
        if (codes && codes.length > 0) {
          const data = codes[0].rawValue;
          console.log('✅ QR detectado (nativo):', data);
          escaneandoRef.current = false;
          procesarQR(data);
          return;
        }
      }
      // MÉTODO 2: jsQR con canvas (fallback universal)
      else if (canvasRef.current && jsQRRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        // Reducir resolución a la mitad para mayor velocidad
        canvas.width = Math.floor(video.videoWidth / 2);
        canvas.height = Math.floor(video.videoHeight / 2);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQRRef.current(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        });
        
        if (code && code.data) {
          console.log('✅ QR detectado (jsQR):', code.data);
          escaneandoRef.current = false;
          procesarQR(code.data);
          return;
        }
      }
    } catch(e) {
      console.warn('Error frame:', e);
    }
    
    // Pequeña pausa entre frames para no saturar el procesador
    setTimeout(() => {
      if (escaneandoRef.current) {
        animRef.current = requestAnimationFrame(escanearFrame);
      }
    }, 150);
  }

  // ── Leer una etiqueta NFC ──
  async function leerNFC() {
    if (!('NDEFReader' in window)) {
      setErrorMensaje('Este móvil o navegador no puede leer NFC. Usa la cámara con el QR.');
      return;
    }
    setErrorMensaje('');
    setLeyendoNfc(true);
    setEstadoScanner('Acerca el móvil a la etiqueta...');

    try {
      const lector = new window.NDEFReader();
      const abort = new AbortController();
      nfcAbortRef.current = abort;

      // scan() pide permiso la primera vez. Mientras está activo,
      // el navegador se queda la lectura en lugar de abrir otra app.
      await lector.scan({ signal: abort.signal });

      lector.onreadingerror = () => {
        setEstadoScanner('No se pudo leer la etiqueta. Prueba otra vez.');
      };

      lector.onreading = (evento) => {
        let leido = null;

        for (const registro of evento.message.records) {
          try {
            if (registro.recordType === 'url') {
              leido = new TextDecoder().decode(registro.data);
            } else if (registro.recordType === 'text') {
              const cod = registro.encoding || 'utf-8';
              leido = new TextDecoder(cod).decode(registro.data);
            }
          } catch (e) { /* registro ilegible, se prueba el siguiente */ }
          if (leido) break;
        }

        // Si la etiqueta no trae nada útil, queda el número de serie
        if (!leido && evento.serialNumber) leido = evento.serialNumber;

        if (!leido) {
          setEstadoScanner('La etiqueta está vacía.');
          return;
        }

        pararNFC();
        procesarQR(leido);   // mismo camino que el QR: acepta URL, IES_DEP_ o UUID
      };
    } catch (e) {
      setLeyendoNfc(false);
      if (e.name === 'NotAllowedError') {
        setErrorMensaje('Hace falta dar permiso de NFC. Vuelve a intentarlo y pulsa "Permitir".');
      } else if (e.name === 'NotSupportedError') {
        setErrorMensaje('El NFC está desactivado en el móvil. Actívalo en los ajustes y prueba otra vez.');
      } else {
        setErrorMensaje('No se pudo iniciar el lector NFC: ' + e.message);
      }
    }
  }

  function pararNFC() {
    if (nfcAbortRef.current) {
      nfcAbortRef.current.abort();
      nfcAbortRef.current = null;
    }
    setLeyendoNfc(false);
  }

  async function procesarQR(data) {
    pararCamara();
    setEstadoScanner('QR detectado, procesando...');
    
    console.log('Datos QR:', data);
    
    // Aceptar múltiples formatos posibles
    let uuid = null;
    
    // Formato esperado: IES_DEP_{uuid}
    if (data.startsWith('IES_DEP_')) {
      uuid = data.replace('IES_DEP_', '').trim();
    }
    // Puede ser URL con el UUID: https://.../IES_DEP_xxx
    else if (data.includes('IES_DEP_')) {
      const match = data.match(/IES_DEP_([a-f0-9-]+)/i);
      if (match) uuid = match[1];
    }
    // Puede ser solo el UUID directo (36 caracteres)
    else if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(data.trim())) {
      uuid = data.trim();
    }
    
    if (!uuid) {
      setErrorMensaje(`El código escaneado no tiene un formato reconocible. Se leyó: "${data.slice(0, 50)}${data.length > 50 ? '...' : ''}". Debe empezar por "IES_DEP_" o ser un UUID válido.`);
      setPantalla('inicio');
      return;
    }
    
    await cargarDependencia(uuid);
  }

  async function cargarDependencia(uuid) {
    try {
      // Buscar primero por id exacto, luego por qr_code
      let dep = null;
      
      // Intento 1: buscar directamente por id
      const { data: porId } = await supaLimpieza
        .from('limpieza_dependencias')
        .select('id, nombre, sector_id, limpieza_sectores(nombre)')
        .eq('id', uuid)
        .limit(1);
      
      if (porId && porId.length > 0) {
        dep = porId[0];
      }
      
      // Intento 2: buscar por qr_code (el campo que genera la app de limpieza)
      if (!dep) {
        const qrCode = uuid.startsWith('IES_DEP_') ? uuid : 'IES_DEP_' + uuid;
        const { data: porQr } = await supaLimpieza
          .from('limpieza_dependencias')
          .select('id, nombre, sector_id, limpieza_sectores(nombre)')
          .eq('qr_code', qrCode)
          .limit(1);
        
        if (porQr && porQr.length > 0) {
          dep = porQr[0];
        }
      }
      
      // Intento 3: traer todas y buscar (fallback)
      if (!dep) {
        const { data: todas } = await supaLimpieza
          .from('limpieza_dependencias')
          .select('id, nombre, sector_id, qr_code, limpieza_sectores(nombre)');
        
        dep = (todas || []).find(d => 
          d.id === uuid || 
          d.qr_code === uuid ||
          d.qr_code === 'IES_DEP_' + uuid ||
          d.id === uuid.replace('IES_DEP_', '')
        );
      }

      if (!dep) {
        setErrorMensaje(`Dependencia no encontrada (código: ${uuid.slice(0,20)}...). ¿Está registrada en el sistema de limpieza?`);
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
        fecha: hoyLocal(),
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
              <div style={{ fontSize:16, fontWeight:800, color:azulOscuro, marginBottom:6 }}>
                ¿Dónde está el problema?
              </div>
              <div style={{ fontSize:13, color:'#666', marginBottom:18, lineHeight:1.5 }}>
                Identifica la dependencia con la pegatina de la puerta del baño, aula o taller.
              </div>

              {/* ── BOTÓN QR ── */}
              <button
                onClick={iniciarEscaneo}
                style={{
                  width:'100%', padding:'16px 18px', borderRadius:12, border:'none',
                  backgroundColor:azul, color:'white', cursor:'pointer', textAlign:'left',
                  boxShadow:'0 2px 8px rgba(8, 145, 178, 0.4)', marginBottom:12,
                }}
              >
                <div style={{ fontSize:16, fontWeight:800, marginBottom:4 }}>
                  📷 Pulsa aquí para leer el QR
                </div>
                <div style={{ fontSize:12, fontWeight:500, opacity:0.9, lineHeight:1.4 }}>
                  Se abrirá la cámara. Apunta al código QR de la pegatina.
                </div>
              </button>

              {/* ── BOTÓN NFC ── */}
              {nfcDisponible && (
                <button
                  onClick={leyendoNfc ? pararNFC : leerNFC}
                  style={{
                    width:'100%', padding:'16px 18px', borderRadius:12,
                    border: leyendoNfc ? '2px solid #7c3aed' : 'none',
                    backgroundColor: leyendoNfc ? '#f5f3ff' : '#7c3aed',
                    color: leyendoNfc ? '#5b21b6' : 'white',
                    cursor:'pointer', textAlign:'left',
                    boxShadow: leyendoNfc ? 'none' : '0 2px 8px rgba(124, 58, 237, 0.4)',
                  }}
                >
                  <div style={{ fontSize:16, fontWeight:800, marginBottom:4 }}>
                    {leyendoNfc ? '⏳ Acerca ahora el móvil a la pegatina' : '📲 Pulsa aquí para leer el NFC'}
                  </div>
                  <div style={{ fontSize:12, fontWeight:500, opacity:0.9, lineHeight:1.4 }}>
                    {leyendoNfc
                      ? 'Acerca la parte de atrás del móvil. Pulsa otra vez para cancelar.'
                      : 'Importante: pulsa el botón ANTES de acercar el móvil. Si lo acercas sin pulsar, se abrirá la app de limpiadores.'}
                  </div>
                </button>
              )}
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
