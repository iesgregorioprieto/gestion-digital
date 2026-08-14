import { createClient } from '@supabase/supabase-js';
import { claveServidor } from '@/lib/claveServidor';

function getSupa() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    claveServidor(),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function POST(request) {
  try {
    const { token } = await request.json();
    if (!token || typeof token !== 'string' || token.length < 10) {
      return Response.json({ error: 'token_invalido' }, { status: 400 });
    }

    const supabase = getSupa();

    const { data: rows, error: errSelect } = await supabase
      .from('profesores')
      .select('id, nombre, email_verificado, estado')
      .eq('token_activacion', token);

    if (errSelect) return Response.json({ error: errSelect.message }, { status: 500 });

    const prof = (rows || [])[0];
    if (!prof) return Response.json({ error: 'token_invalido' }, { status: 404 });

    if (prof.email_verificado) {
      return Response.json({ ok: true, ya_activa: true, nombre: prof.nombre });
    }

    const { error: errUpd } = await supabase
      .from('profesores')
      .update({ email_verificado: true, token_activacion: null })
      .eq('id', prof.id);

    if (errUpd) return Response.json({ error: errUpd.message }, { status: 500 });

    return Response.json({ ok: true, ya_activa: false, nombre: prof.nombre });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
