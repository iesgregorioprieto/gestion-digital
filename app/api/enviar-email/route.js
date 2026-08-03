import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'secretario@iesgregorioprieto.com';
const REPLY_TO = 'llcc12@educastillalamancha.es';

export async function POST(request) {
  try {
    const { tipo, datos } = await request.json();
    let subject, html;

    if (tipo === 'activacion_cuenta') {
      subject = '✅ Tu acceso al Portal del IES Gregorio Prieto ha sido activado';
      html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#1e3a5f;padding:20px;text-align:center">
            <h1 style="color:white;margin:0">IES Gregorio Prieto</h1>
            <p style="color:#adc8e8;margin:5px 0">Portal de Gestión</p>
          </div>
          <div style="padding:30px;background:#f9f9f9">
            <h2 style="color:#1e3a5f">Hola, ${datos.nombre} ${datos.apellidos}</h2>
            <p>Tu solicitud de acceso al portal ha sido <strong style="color:green">aprobada</strong>.</p>
            <p>Ya puedes iniciar sesión con tu correo: <strong>${datos.email}</strong></p>
            ${datos.rol_gestion ? `<p>Permisos asignados: <strong>${datos.rol_gestion}</strong></p>` : ''}
            <div style="text-align:center;margin:30px 0">
              <a href="https://gestion-digital.vercel.app/login"
                 style="background:#1e3a5f;color:white;padding:12px 30px;border-radius:6px;text-decoration:none;font-size:16px">
                Acceder al portal
              </a>
            </div>
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
            <h2 style="color:#1e3a5f">Hola, ${datos.nombre}</h2>
            <p>Tu solicitud de DLD ha sido <strong style="color:green">aprobada</strong>.</p>
            <table style="width:100%;border-collapse:collapse;margin:20px 0">
              <tr style="background:#e8eef4">
                <td style="padding:10px;font-weight:bold">Fecha</td>
                <td style="padding:10px">${datos.fecha_solicitada}</td>
              </tr>
              <tr>
                <td style="padding:10px;font-weight:bold">Tipo</td>
                <td style="padding:10px">${datos.tipo_dld || 'DLD'}</td>
              </tr>
            </table>
            <div style="text-align:center;margin:30px 0">
              <a href="https://gestion-digital.vercel.app/dld"
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
            <h2 style="color:#1e3a5f">Hola, ${datos.nombre}</h2>
            <p>Tu solicitud de DLD ha sido <strong style="color:#c0392b">denegada</strong>.</p>
            <table style="width:100%;border-collapse:collapse;margin:20px 0">
              <tr style="background:#e8eef4">
                <td style="padding:10px;font-weight:bold">Fecha solicitada</td>
                <td style="padding:10px">${datos.fecha_solicitada}</td>
              </tr>
              ${datos.motivo_rechazo ? `<tr>
                <td style="padding:10px;font-weight:bold">Motivo</td>
                <td style="padding:10px">${datos.motivo_rechazo}</td>
              </tr>` : ''}
            </table>
            <p style="color:#666;font-size:13px">Si tienes dudas, contacta con la jefatura de estudios.</p>
            <div style="text-align:center;margin:30px 0">
              <a href="https://gestion-digital.vercel.app/dld"
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
            <h2 style="color:#1e3a5f">Hola, ${datos.nombre}</h2>
            <p>Se te ha asignado una <strong>guardia de apoyo</strong>:</p>
            <table style="width:100%;border-collapse:collapse;margin:20px 0">
              <tr style="background:#e8eef4">
                <td style="padding:10px;font-weight:bold">Fecha</td>
                <td style="padding:10px">${datos.fecha}</td>
              </tr>
              <tr>
                <td style="padding:10px;font-weight:bold">Hora</td>
                <td style="padding:10px">${datos.hora}</td>
              </tr>
              ${datos.grupo ? `<tr style="background:#e8eef4">
                <td style="padding:10px;font-weight:bold">Grupo a cubrir</td>
                <td style="padding:10px">${datos.grupo}</td>
              </tr>` : ''}
              ${datos.aula ? `<tr>
                <td style="padding:10px;font-weight:bold">Aula</td>
                <td style="padding:10px">${datos.aula}</td>
              </tr>` : ''}
            </table>
            <div style="text-align:center;margin:30px 0">
              <a href="https://gestion-digital.vercel.app/guardias"
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
            <h2 style="color:#1e3a5f">Hola, ${datos.nombre}</h2>
            <p>⚠️ Tienes una ausencia pendiente de justificar. El <strong>plazo vence en menos de 24 horas</strong>.</p>
            <table style="width:100%;border-collapse:collapse;margin:20px 0">
              <tr style="background:#fff3cd">
                <td style="padding:10px;font-weight:bold">Fecha ausencia</td>
                <td style="padding:10px">${datos.fecha_inicio}</td>
              </tr>
              <tr>
                <td style="padding:10px;font-weight:bold">Motivo declarado</td>
                <td style="padding:10px">${datos.motivo || '—'}</td>
              </tr>
            </table>
            <p style="color:#856404;background:#fff3cd;padding:10px;border-radius:6px">
              Recuerda que dispones de 3 días hábiles para adjuntar el justificante.
            </p>
            <div style="text-align:center;margin:30px 0">
              <a href="https://gestion-digital.vercel.app/ausencias"
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
            <h2 style="color:#1e3a5f">Hola, ${datos.nombre}</h2>
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
            <h2 style="color:#1e3a5f">Hola, ${datos.nombre}</h2>
            <p>Has solicitado restablecer tu contraseña del portal.</p>
            <p>Pulsa el botón para elegir una nueva contraseña:</p>
            <div style="text-align:center;margin:30px 0">
              <a href="${datos.enlace}"
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

    } else {
      return Response.json({ error: 'Tipo de email desconocido' }, { status: 400 });
    }

    const { data, error } = await resend.emails.send({
      from: FROM,
      reply_to: REPLY_TO,
      to: [datos.email],
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
