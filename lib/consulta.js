/**
 * CONSULTA SEGURA
 *
 * Sustituye a getSupabase().from(...).select(...).eq(...)... en las
 * pantallas del navegador. En vez de leer directamente la base de datos
 * con la clave del navegador (que falla cuando la tabla tiene RLS
 * cerrado), manda la consulta al servidor por /api/consulta, que usa la
 * clave de servicio y comprueba la sesión.
 *
 * La interfaz imita la de Supabase para que la migración sea un cambio
 * de import, no una reescritura:
 *
 *   import { consulta } from '@/lib/consulta';
 *
 *   // Antes:
 *   const { data } = await getSupabase().from('profesores').select('id, nombre').eq('estado', 'activo');
 *
 *   // Ahora:
 *   const { data } = await consulta('profesores').select('id, nombre').eq('estado', 'activo').ejecutar();
 *
 * La diferencia visible es el .ejecutar() al final, que dispara el
 * fetch. Todo lo de antes es encadenamiento que acumula los filtros.
 */

export function consulta(tabla) {
  return new ConsultaBuilder(tabla);
}

/** Atajo para llamadas RPC */
export async function consultaRpc(nombre, params = {}) {
  const r = await fetch('/api/consulta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rpc: nombre, rpcParams: params }),
  });
  const d = await r.json();
  return { data: d.data ?? null, error: d.error ? { message: d.error } : null };
}

class ConsultaBuilder {
  constructor(tabla) {
    this._tabla = tabla;
    this._columns = null;
    this._filtros = [];
    this._orden = [];
    this._limite = null;
  }

  select(columns) { this._columns = columns; return this; }
  eq(col, val)    { this._filtros.push({ col, op: 'eq', val }); return this; }
  neq(col, val)   { this._filtros.push({ col, op: 'neq', val }); return this; }
  in(col, val)    { this._filtros.push({ col, op: 'in', val }); return this; }
  ilike(col, val) { this._filtros.push({ col, op: 'ilike', val }); return this; }
  is(col, val)    { this._filtros.push({ col, op: 'is', val }); return this; }
  not(col, op, val) { this._filtros.push({ col, op: 'not.is', val }); return this; }
  lte(col, val)   { this._filtros.push({ col, op: 'lte', val }); return this; }
  gte(col, val)   { this._filtros.push({ col, op: 'gte', val }); return this; }
  or(val)         { this._filtros.push({ col: null, op: 'or', val }); return this; }
  limit(n)        { this._limite = n; return this; }
  order(col, opts = {}) {
    this._orden.push({ col, asc: opts.ascending !== false });
    return this;
  }

  /** Alias: se puede llamar como .then() para uso con await directo */
  then(resolve, reject) {
    return this.ejecutar().then(resolve, reject);
  }

  async ejecutar() {
    try {
      const r = await fetch('/api/consulta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tabla: this._tabla,
          columns: this._columns,
          filtros: this._filtros,
          orden: this._orden.length ? this._orden : undefined,
          limite: this._limite,
        }),
      });
      const d = await r.json();
      if (d.error) return { data: null, error: { message: d.error }, count: null };
      return { data: d.data || [], error: null, count: d.count ?? null };
    } catch (e) {
      return { data: null, error: { message: e.message || 'Error de red' }, count: null };
    }
  }
}
