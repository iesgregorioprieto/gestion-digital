
export async function POST(request) {
  try {
    const { accion, password, hash } = await request.json();

    if (accion === 'hash') {
      // Generar hash con PBKDF2
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
      );
      const derivedBits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        keyMaterial, 256
      );
      const hashArray = new Uint8Array(derivedBits);
      const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
      const hashHex = Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('');
      return Response.json({ hash: saltHex + ':' + hashHex });

    } else if (accion === 'verify') {
      // Solo se aceptan hashes en formato PBKDF2 (salt:hash)
      if (!hash || !hash.includes(':')) {
        return Response.json({ ok: false });
      }
      const [saltHex, hashHex] = hash.split(':');
      const salt = new Uint8Array(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)));
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
      );
      const derivedBits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        keyMaterial, 256
      );
      const computedHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
      return Response.json({ ok: computedHex === hashHex });

    } else {
      return Response.json({ error: 'Acción desconocida' }, { status: 400 });
    }
  } catch (err) {
    console.error('Error en password API:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
