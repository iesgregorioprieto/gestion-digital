import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';

/**
 * ENVÍO DE CORREOS DEL PORTAL
 *
 * Antes esta dirección era un buzón abierto: cualquiera desde fuera podía
 * pedirle al servidor que mandase un correo, a quien quisiera, con la
 * dirección del centro como remitente. El caso más peligroso era el correo
 * de "restablecer contraseña", porque el enlace del botón lo ponía quien
 * llamaba: se podía suplantar al instituto para robar contraseñas.
 *
 * Ahora cada tipo de correo tiene su propia puerta:
 *
 *   GESTION  → solo con sesión de director, secretario o jefe de estudios
 *   INTERNO  → solo desde el propio servidor, con una clave que el
 *              navegador nunca ve
 *   REGISTRO → sin sesión (quien se registra aún no la tiene), pero el
 *              servidor comprueba en la base de datos que ese correo
 *              acaba de registrarse de verdad, y usa el nombre de la BD
 *
 * Se ha eliminado el GET de pruebas, que enviaba correos a cualquier
 * dirección sin ninguna comprobación.
 */

const FROM = 'secretario@iesgregorioprieto.com';
const REPLY_TO = 'llcc12@educastillalamancha.es';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.iesgregorioprieto.com';

// Resend se crea dentro de la petición, nunca a nivel de módulo.
// Si falta la clave se avisa aquí y con nombre y apellidos: sin esta
// comprobación, el fallo aparecía más tarde y con un mensaje de la
// librería que no mencionaba la variable. El síntoma era "los correos
// no llegan" sin ninguna pista de por qué.
function getResend() {
  const clave = process.env.RESEND_API_KEY;
  if (!clave) {
    console.error('RESEND_API_KEY no configurada — no se envía ningún correo. Revisa las variables de entorno en Vercel.');
    throw new Error('resend_sin_configurar');
  }
  return new Resend(clave);
}

// ── Clasificación de los tipos de correo ────────────────────────────
const GESTION = ['activacion_cuenta', 'dld_aprobada', 'dld_rechazada', 'guardia_asignada'];
const INTERNO = ['recuperar_password', 'justificacion_pendiente', 'nueva_solicitud_secretario', 'sugerencias_del_dia'];
const REGISTRO = ['registro_pendiente'];

// ── Utilidades ──────────────────────────────────────────────────────

/** Escapa el texto para que nadie pueda colar HTML dentro del correo */
function e(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .slice(0, 300)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function emailValido(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) && v.length < 200;
}

function noAutorizado(motivo) {
  console.warn('enviar-email rechazado:', motivo);
  return Response.json({ error: 'No autorizado' }, { status: 401 });
}

// ────────────────────────────────────────────────────────────────────

export async function POST(request) {
  try {
    const secreto = process.env.SESSION_SECRET;

    // Sin clave configurada no se puede comprobar nada: mejor no enviar
    // que dejar la puerta abierta.
    if (!secreto) {
      console.error('Falta SESSION_SECRET: no se envía ningún correo');
      return Response.json({ error: 'Portal mal configurado' }, { status: 503 });
    }

    // Si la petición viene de otra web, se rechaza.
    // Las llamadas del propio servidor no traen esta cabecera.
    const origen = request.headers.get('origin');
    if (origen) {
      try {
        const propio = request.headers.get('host') || new URL(request.url).host;
        if (new URL(origen).host !== propio) {
          return noAutorizado('origen externo: ' + origen);
        }
      } catch (_) {
        return noAutorizado('origen ilegible');
      }
    }

    const { tipo, datos } = await request.json();
    if (!tipo || !datos || typeof datos !== 'object') {
      return Response.json({ error: 'Petición incompleta' }, { status: 400 });
    }

    let destinatario = datos.email;

    // ── PUERTA 1: correos de gestión (requieren sesión de directivo) ──
    if (GESTION.includes(tipo)) {
      const cookies = request.headers.get('cookie') || '';
      const m = cookies.match(new RegExp(`${COOKIE}=([^;]+)`));
      const sesion = m ? await verificarSesion(m[1], secreto) : null;
      if (!esDirectivo(sesion)) return noAutorizado('sin sesión de directivo para ' + tipo);
    }

    // ── PUERTA 2: correos internos (solo desde el propio servidor) ────
    else if (INTERNO.includes(tipo)) {
      if (request.headers.get('x-clave-interna') !== secreto) {
        return noAutorizado('sin clave interna para ' + tipo);
      }
      // El enlace de recuperación solo puede apuntar al propio portal
      if (tipo === 'recuperar_password') {
        if (typeof datos.enlace !== 'string' || !datos.enlace.startsWith(BASE_URL)) {
          return noAutorizado('enlace de recuperación fuera del portal');
        }
      }
    }

    // ── PUERTA 3: registro (sin sesión, pero comprobado en la BD) ─────
    else if (REGISTRO.includes(tipo)) {
      if (!emailValido(datos.email)) {
        return Response.json({ error: 'Correo no válido' }, { status: 400 });
      }
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        claveServidor()
      );
      const { data: filas } = await supabase
        .from('profesores')
        .select('nombre, email, estado, solicitud_acceso')
        .ilike('email', datos.email.trim().toLowerCase());

      const prof = (filas || [])[0];
      if (!prof || prof.estado !== 'pendiente' || !prof.solicitud_acceso) {
        return noAutorizado('registro_pendiente sin solicitud real');
      }
      // El nombre y el destinatario salen de la base de datos, no del navegador
      destinatario = prof.email;
      datos.nombre = prof.nombre;
    }

    else {
      return Response.json({ error: 'Tipo de email desconocido' }, { status: 400 });
    }

    if (!emailValido(destinatario)) {
      return Response.json({ error: 'Correo no válido' }, { status: 400 });
    }

    // ── Construcción del mensaje ─────────────────────────────────────
    let subject, html;

    if (tipo === 'activacion_cuenta') {
      const enlaceActivar = `${BASE_URL}/activar?t=${encodeURIComponent(datos.token || '')}`;
      subject = '✅ Tu acceso al Portal del IES Gregorio Prieto ha sido activado';
      html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#1e3a5f;padding:20px;text-align:center">
            <h1 style="color:white;margin:0">IES Gregorio Prieto</h1>
            <p style="color:#adc8e8;margin:5px 0">Portal de Gestión</p>
          </div>
          <div style="padding:30px;background:#f9f9f9">
            <h2 style="color:#1e3a5f">Hola${datos.nombre ? ', ' + e(datos.nombre) + ' ' + e(datos.apellidos || '') : ''}</h2>
            <p>Tu solicitud de acceso al portal ha sido <strong style="color:green">aprobada</strong>.</p>
            <p>Para terminar, activa tu cuenta desde este enlace:</p>
            <div style="text-align:center;margin:26px 0">
              <a href="${enlaceActivar}"
                 style="background:#1e6b2e;color:white;padding:14px 34px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold;display:inline-block">
                Activar mi cuenta
              </a>
            </div>
            <p style="color:#666;font-size:13px;line-height:1.6">
              Si el botón no funciona, copia esta dirección en tu navegador:<br>
              <span style="color:#1e3a5f;word-break:break-all">${enlaceActivar}</span>
            </p>
            <p style="color:#555;font-size:14px">
              Después podrás entrar con <strong>${e(datos.email)}</strong> y la contraseña que creaste.
              Solo hay que activarla una vez.
            </p>
            ${datos.rol_gestion ? `<p>Permisos asignados: <strong>${e(datos.rol_gestion)}</strong></p>` : ''}
            <p style="color:#666;font-size:13px">Si tienes algún problema para acceder, contacta con la secretaría del centro.</p>
          </div>
          <div style="background:#e8eef4;padding:15px;text-align:center;font-size:12px;color:#666">
            IES Gregorio Prieto · Valdepeñas · Ciudad Real
          </div>
        </div>`;

    } else if (tipo === 'dld_aprobada') {
      subject = `✅ DLD aprobado — ${datos.fecha_solicitada}`;
      html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#1e3a5f;padding:20px;text-align:center">
            <h1 style="color:white;margin:0">IES Gregorio Prieto</h1>
            <p style="color:#adc8e8;margin:5px 0">Portal de Gestión</p>
          </div>
          <div style="padding:30px;background:#f9f9f9">
            <h2 style="color:#1e3a5f">Hola, ${e(datos.nombre)}</h2>
            <p>Tu solicitud de DLD ha sido <strong style="color:green">aprobada</strong>.</p>
            <table style="width:100%;border-collapse:collapse;margin:20px 0">
              <tr style="background:#e8eef4">
                <td style="padding:10px;font-weight:bold">Fecha</td>
                <td style="padding:10px">${e(datos.fecha_solicitada)}</td>
              </tr>
              <tr>
                <td style="padding:10px;font-weight:bold">Tipo</td>
                <td style="padding:10px">${e(datos.tipo_dld || 'DLD')}</td>
              </tr>
            </table>
            <div style="text-align:center;margin:30px 0">
              <a href="${BASE_URL}/dld"
                 style="background:#1e3a5f;color:white;padding:12px 30px;border-radius:6px;text-decoration:none;font-size:16px">
                Ver mis solicitudes
              </a>
            </div>
          </div>
          <div style="background:#e8eef4;padding:15px;text-align:center;font-size:12px;color:#666">
            IES Gregorio Prieto · Valdepeñas · Ciudad Real
          </div>
        </div>`;

    } else if (tipo === 'dld_rechazada') {
      subject = `❌ DLD denegado — ${datos.fecha_solicitada}`;
      html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#1e3a5f;padding:20px;text-align:center">
            <h1 style="color:white;margin:0">IES Gregorio Prieto</h1>
            <p style="color:#adc8e8;margin:5px 0">Portal de Gestión</p>
          </div>
          <div style="padding:30px;background:#f9f9f9">
            <h2 style="color:#1e3a5f">Hola, ${e(datos.nombre)}</h2>
            <p>Tu solicitud de DLD ha sido <strong style="color:#c0392b">denegada</strong>.</p>
            <table style="width:100%;border-collapse:collapse;margin:20px 0">
              <tr style="background:#e8eef4">
                <td style="padding:10px;font-weight:bold">Fecha solicitada</td>
                <td style="padding:10px">${e(datos.fecha_solicitada)}</td>
              </tr>
              ${datos.motivo_rechazo ? `<tr>
                <td style="padding:10px;font-weight:bold">Motivo</td>
                <td style="padding:10px">${e(datos.motivo_rechazo)}</td>
              </tr>` : ''}
            </table>
            <p style="color:#666;font-size:13px">Si tienes dudas, contacta con la jefatura de estudios.</p>
            <div style="text-align:center;margin:30px 0">
              <a href="${BASE_URL}/dld"
                 style="background:#1e3a5f;color:white;padding:12px 30px;border-radius:6px;text-decoration:none;font-size:16px">
                Ver mis solicitudes
              </a>
            </div>
          </div>
          <div style="background:#e8eef4;padding:15px;text-align:center;font-size:12px;color:#666">
            IES Gregorio Prieto · Valdepeñas · Ciudad Real
          </div>
        </div>`;

    } else if (tipo === 'guardia_asignada') {
      subject = `📋 Guardia asignada — ${datos.fecha} ${datos.hora}`;
      html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#1e3a5f;padding:20px;text-align:center">
            <h1 style="color:white;margin:0">IES Gregorio Prieto</h1>
            <p style="color:#adc8e8;margin:5px 0">Portal de Gestión</p>
          </div>
          <div style="padding:30px;background:#f9f9f9">
            <h2 style="color:#1e3a5f">Hola, ${e(datos.nombre)}</h2>
            <p>Se te ha asignado una <strong>guardia de apoyo</strong>:</p>
            <table style="width:100%;border-collapse:collapse;margin:20px 0">
              <tr style="background:#e8eef4">
                <td style="padding:10px;font-weight:bold">Fecha</td>
                <td style="padding:10px">${e(datos.fecha)}</td>
              </tr>
              <tr>
                <td style="padding:10px;font-weight:bold">Hora</td>
                <td style="padding:10px">${e(datos.hora)}</td>
              </tr>
              ${datos.grupo ? `<tr style="background:#e8eef4">
                <td style="padding:10px;font-weight:bold">Grupo a cubrir</td>
                <td style="padding:10px">${e(datos.grupo)}</td>
              </tr>` : ''}
              ${datos.aula ? `<tr>
                <td style="padding:10px;font-weight:bold">Aula</td>
                <td style="padding:10px">${e(datos.aula)}</td>
              </tr>` : ''}
            </table>
            <div style="text-align:center;margin:30px 0">
              <a href="${BASE_URL}/guardias"
                 style="background:#1e3a5f;color:white;padding:12px 30px;border-radius:6px;text-decoration:none;font-size:16px">
                Ver mis guardias
              </a>
            </div>
          </div>
          <div style="background:#e8eef4;padding:15px;text-align:center;font-size:12px;color:#666">
            IES Gregorio Prieto · Valdepeñas · Ciudad Real
          </div>
        </div>`;

    } else if (tipo === 'justificacion_pendiente') {
      subject = `⚠️ Recuerda justificar tu ausencia — plazo próximo a vencer`;
      html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#1e3a5f;padding:20px;text-align:center">
            <h1 style="color:white;margin:0">IES Gregorio Prieto</h1>
            <p style="color:#adc8e8;margin:5px 0">Portal de Gestión</p>
          </div>
          <div style="padding:30px;background:#f9f9f9">
            <h2 style="color:#1e3a5f">Hola, ${e(datos.nombre)}</h2>
            <p>⚠️ Tienes una ausencia pendiente de justificar. El <strong>plazo vence en menos de 24 horas</strong>.</p>
            <table style="width:100%;border-collapse:collapse;margin:20px 0">
              <tr style="background:#fff3cd">
                <td style="padding:10px;font-weight:bold">Fecha ausencia</td>
                <td style="padding:10px">${e(datos.fecha_inicio)}</td>
              </tr>
              <tr>
                <td style="padding:10px;font-weight:bold">Motivo declarado</td>
                <td style="padding:10px">${e(datos.motivo || '—')}</td>
              </tr>
            </table>
            <p style="color:#856404;background:#fff3cd;padding:10px;border-radius:6px">
              Recuerda que dispones de 3 días hábiles para adjuntar el justificante.
            </p>
            <div style="text-align:center;margin:30px 0">
              <a href="${BASE_URL}/ausencias"
                 style="background:#e67e22;color:white;padding:12px 30px;border-radius:6px;text-decoration:none;font-size:16px">
                Justificar ahora
              </a>
            </div>
          </div>
          <div style="background:#e8eef4;padding:15px;text-align:center;font-size:12px;color:#666">
            IES Gregorio Prieto · Valdepeñas · Ciudad Real
          </div>
        </div>`;

    } else if (tipo === 'registro_pendiente') {
      subject = '📝 Registro recibido — APrieto';
      html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#1e3a5f;padding:20px;text-align:center">
            <h1 style="color:white;margin:0">APrieto</h1>
            <p style="color:#adc8e8;margin:5px 0">IES Gregorio Prieto</p>
          </div>
          <div style="padding:30px;background:#f9f9f9">
            <h2 style="color:#1e3a5f">Hola, ${e(datos.nombre)}</h2>
            <p>Tu registro en el portal se ha completado correctamente.</p>
            <p>Tu cuenta está <strong style="color:#d97706">pendiente de autorización</strong> por la secretaría del centro.</p>
            <p>Recibirás un correo de confirmación cuando tu acceso haya sido activado.</p>
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px;margin:20px 0">
              <p style="margin:0;color:#92400e;font-size:14px">⏳ No es necesario que hagas nada más. Te avisaremos por email cuando puedas acceder.</p>
            </div>
          </div>
          <div style="background:#e8eef4;padding:15px;text-align:center;font-size:12px;color:#666">
            IES Gregorio Prieto · Valdepeñas · Ciudad Real
          </div>
        </div>`;

    } else if (tipo === 'recuperar_password') {
      subject = '🔑 Restablecer contraseña — APrieto';
      html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#1e3a5f;padding:20px;text-align:center">
            <h1 style="color:white;margin:0">APrieto</h1>
            <p style="color:#adc8e8;margin:5px 0">IES Gregorio Prieto</p>
          </div>
          <div style="padding:30px;background:#f9f9f9">
            <h2 style="color:#1e3a5f">Hola, ${e(datos.nombre)}</h2>
            <p>Has solicitado restablecer tu contraseña del portal.</p>
            <p>Pulsa el botón para elegir una nueva contraseña:</p>
            <div style="text-align:center;margin:30px 0">
              <a href="${e(datos.enlace)}"
                 style="background:#1e3a5f;color:white;padding:14px 35px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold">
                Restablecer contraseña
              </a>
            </div>
            <p style="color:#666;font-size:13px">Este enlace caduca en <strong>30 minutos</strong>. Si no has solicitado esto, ignora este correo.</p>
          </div>
          <div style="background:#e8eef4;padding:15px;text-align:center;font-size:12px;color:#666">
            IES Gregorio Prieto · Valdepeñas · Ciudad Real
          </div>
        </div>`;

    } else if (tipo === 'sugerencias_del_dia') {
      const lista = Array.isArray(datos.sugerencias) ? datos.sugerencias : [];
      subject = `💬 ${lista.length} sugerencia${lista.length === 1 ? '' : 's'} sobre los módulos en prueba`;
      html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#1e3a5f;padding:20px;text-align:center">
            <h1 style="color:white;margin:0">APrieto</h1>
            <p style="color:#adc8e8;margin:5px 0">IES Gregorio Prieto</p>
          </div>
          <div style="padding:26px;background:#f9f9f9">
            <h2 style="color:#1e3a5f;margin:0 0 6px">Sugerencias de mejora</h2>
            <p style="color:#666;font-size:13px;margin:0 0 18px">
              Recogidas hoy en los módulos que están en periodo de prueba.
            </p>
            ${lista.map(s => `
              <div style="background:white;border-left:4px solid #f59e0b;border-radius:8px;padding:14px;margin-bottom:10px">
                <div style="font-size:12px;color:#92400e;font-weight:bold;margin-bottom:6px">
                  ${e(s.modulo)} — ${e(s.valoracion)}
                </div>
                <div style="font-size:14px;color:#333;line-height:1.6">${e(s.sugerencia)}</div>
                <div style="font-size:11px;color:#999;margin-top:8px">
                  ${s.quien ? '✉️ ' + e(s.quien) + ' acepta que se le pregunte' : 'Enviada sin identificar'}
                </div>
              </div>`).join('')}
            <div style="text-align:center;margin:24px 0 6px">
              <a href="${BASE_URL}/gestion/valoraciones"
                 style="background:#1e3a5f;color:white;padding:12px 28px;border-radius:6px;text-decoration:none;font-size:15px;font-weight:bold">
                Ver todas las valoraciones
              </a>
            </div>
          </div>
          <div style="background:#e8eef4;padding:15px;text-align:center;font-size:12px;color:#666">
            IES Gregorio Prieto · Valdepeñas · Ciudad Real
          </div>
        </div>`;

    } else if (tipo === 'nueva_solicitud_secretario') {
      subject = `📨 Nueva solicitud de acceso — ${datos.nombre}`;
      html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#1e6b2e;padding:20px;text-align:center">
            <h1 style="color:white;margin:0">APrieto</h1>
            <p style="color:#a7f3d0;margin:5px 0">IES Gregorio Prieto</p>
          </div>
          <div style="padding:30px;background:#f9f9f9">
            <h2 style="color:#1e6b2e">Nueva solicitud de acceso</h2>
            <p>Un profesor ha completado su registro y espera tu aprobación:</p>
            <table style="width:100%;border-collapse:collapse;margin:20px 0">
              <tr style="background:#e8f5e9">
                <td style="padding:10px;font-weight:bold">Nombre</td>
                <td style="padding:10px">${e(datos.nombre)}</td>
              </tr>
              <tr>
                <td style="padding:10px;font-weight:bold">Email</td>
                <td style="padding:10px">${e(datos.email)}</td>
              </tr>
              <tr style="background:#e8f5e9">
                <td style="padding:10px;font-weight:bold">Departamento</td>
                <td style="padding:10px">${e(datos.departamento || '—')}</td>
              </tr>
            </table>
            <div style="text-align:center;margin:30px 0">
              <a href="${BASE_URL}/gestion/personal"
                 style="background:#1e6b2e;color:white;padding:14px 35px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold">
                Revisar solicitud
              </a>
            </div>
          </div>
          <div style="background:#e8f5e9;padding:15px;text-align:center;font-size:12px;color:#666">
            IES Gregorio Prieto · Valdepeñas · Ciudad Real
          </div>
        </div>`;

    } else {
      return Response.json({ error: 'Tipo de email desconocido' }, { status: 400 });
    }

    const { data, error } = await getResend().emails.send({
      from: FROM,
      reply_to: REPLY_TO,
      to: [destinatario],
      subject,
      html,
    });

    if (error) {
      console.error('Error Resend:', error);
      return Response.json({ error }, { status: 500 });
    }

    return Response.json({ ok: true, id: data.id });
  } catch (err) {
    console.error('Error en enviar-email:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
