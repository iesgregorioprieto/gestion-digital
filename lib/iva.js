// IVA de un artículo. Un 0 % es un valor válido (exento), no "sin dato":
// solo se usa el 21 % por defecto si el campo está vacío o no es un número.
export function ivaDe(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 21;
}
