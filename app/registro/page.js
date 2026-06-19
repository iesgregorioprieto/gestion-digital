"use client";
import { useState } from "react";

const DEPARTAMENTOS = [
  "TMV / Carrocería","Hostelería","Informática","Electricidad",
  "Comercio","Administración","Industrias Alimentarias","FOL",
  "Física y Química","Ciencias Naturales / Biología","Matemáticas",
  "Lengua y Literatura","Inglés","Educación Física","Dibujo / Plástica",
  "Geografía e Historia","Filosofía","Música","Tecnología","Orientación","PT / AL",
];

const ROLES = [
  { value: "profesor", label: "Profesor/a", icono: "📚", desc: "Docencia y guardias" },
  { value: "tutor", label: "Tutor/a", icono: "🤝", desc: "Docencia + tutoría de grupo" },
  { value: "jefe_departamento", label: "Jefe/a de Dpto.", icono: "📂", desc: "Docencia + gestión de dpto." },
];

const TIPOS = [
  { value: "carrera", label: "Funcionario de carrera" },
  { value: "interino_vacante", label: "Interino con vacante" },
  { value: "interino_sin_vacante", label: "Interino sin vacante" },
  { value: "multiples_nombramientos", label: "Múltiples nombramientos" },
];

const verde = "#2E7023";
const verdeM = "#5A9E30";
const verdeF = "#F0F8E8";

const estiloInput = (error) => ({
  width: "100%",
  padding: "12px 14px",
  border: error ? "2px solid #e53e3e" : "2px solid #ddd",
  borderRadius: "10px",
  fontSize: "0.9rem",
  outline: "none",
  background: "#fafafa",
  boxSizing: "border-box",
});

const estiloLabel = {
  display: "block",
  fontSize: "0.75rem",
  fontWeight: "700",
  color: verde,
  letterSpacing: "1px",
  textTransform: "uppercase",
  marginBottom: "6px",
};

export default function Registro() {
  const [paso, setPaso] = useState(1);
  const [enviado, setEnviado] = useState(false);
  const [form, setForm] = useState({
    nombre: "", apellidos: "", departamento: "", especialidad: "",
    tipo: "", antiguedad_centro: "", antiguedad_cuerpo: "",
    rol: "", es_tutor: false, grupo: "", password: "", password2: "",
  });
  const [errores, setErrores] = useState({});

  const set = (campo) => (e) => {
    const valor = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm(f => ({ ...f, [campo]: valor }));
    setErrores(e2 => ({ ...e2, [campo]: null }));
  };

  const setRol = (valor) => {
    setForm(f => ({ ...f, rol: valor }));
    setErrores(e => ({ ...e, rol: null }));
  };

  const validarPaso1 = () => {
    const e = {};
    if (!form.nombre.trim()) e.nombre = "Obligatorio";
    if (!form.apellidos.trim()) e.apellidos = "Obligatorio";
    if (!form.departamento) e.departamento = "Selecciona un departamento";
    if (!form.especialidad.trim()) e.especialidad = "Obligatorio";
    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const validarPaso2 = () => {
    const e = {};
    if (!form.tipo) e.tipo = "Selecciona el tipo";
    if (form.antiguedad_centro === "") e.antiguedad_centro = "Obligatorio";
    if (form.antiguedad_cuerpo === "") e.antiguedad_cuerpo = "Obligatorio";
    if (!form.rol) e.rol = "Selecciona tu rol";
    if (form.es_tutor && !form.grupo.trim()) e.grupo = "Indica el grupo";
    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const validarPaso3 = () => {
    const e = {};
    if (!form.password || form.password.length < 8) e.password = "Mínimo 8 caracteres";
    if (form.password !== form.password2) e.password2 = "Las contraseñas no coinciden";
    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const siguiente = () => {
    if (paso === 1 && validarPaso1()) setPaso(2);
    else if (paso === 2 && validarPaso2()) setPaso(3);
    else if (paso === 3 && validarPaso3()) setEnviado(true);
  };

  if (enviado) return (
    <div style={{ minHeight: "100vh", background: verdeF, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "white", borderRadius: "24px", padding: "48px 40px", textAlign: "center", boxShadow: "0 8px 40px rgba(46,112,35,0.15)", maxWidth: "440px", width: "100%" }}>
        <div style={{ fontSize: "4rem", marginBottom: "16px" }}>✅</div>
        <h2 style={{ color: verde, fontWeight: "800", fontSize: "1.4rem", margin: "0 0 12px" }}>¡Solicitud enviada!</h2>
        <p style={{ color: "#555", lineHeight: "1.6", margin: "0 0 24px" }}>Tu solicitud ha sido recibida. El secretario del centro revisará tus datos y activará tu cuenta en breve.</p>
        <div style={{ background: verdeF, borderRadius: "12px", padding: "16px", marginBottom: "24px" }}>
          <p style={{ margin: 0, color: verde, fontWeight: "600", fontSize: "0.85rem" }}>👤 {form.nombre} {form.apellidos}</p>
          <p style={{ margin: "4px 0 0", color: "#666", fontSize: "0.82rem" }}>{form.departamento} · {ROLES.find(r => r.value === form.rol)?.label}</p>
        </div>
        <a href="/" style={{ display: "inline-block", background: `linear-gradient(135deg,${verde},${verdeM})`, color: "white", padding: "12px 28px", borderRadius: "12px", textDecoration: "none", fontWeight: "700", fontSize: "0.9rem" }}>← Volver al inicio</a>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: verdeF, fontFamily: "Segoe UI, Arial, sans-serif" }}>

      <header style={{ background: `linear-gradient(135deg,${verde},${verdeM})`, padding: "14px 24px", display: "flex", alignItems: "center", gap: "16px", boxShadow: "0 3px 12px rgba(0,0,0,0.2)" }}>
        <a href="/" style={{ color: "rgba(255,255,255,0.85)", textDecoration: "none", fontSize: "0.85rem", fontWeight: "600" }}>← Volver</a>
        <h1 style={{ color: "white", margin: 0, fontSize: "1.1rem", fontWeight: "700" }}>IES Gregorio Prieto · Registro de Profesor/a</h1>
      </header>

      <main style={{ maxWidth: "560px", margin: "0 auto", padding: "40px 20px" }}>

        {/* PASOS */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: "36px" }}>
          {[{ n: 1, label: "Datos personales" }, { n: 2, label: "Datos laborales" }, { n: 3, label: "Contraseña" }].map(({ n, label }, i) => (
            <div key={n} style={{ display: "flex", alignItems: "center", flex: i < 2 ? 1 : "none" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: paso >= n ? `linear-gradient(135deg,${verde},${verdeM})` : "#ddd", color: paso >= n ? "white" : "#999", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", fontSize: "0.9rem" }}>{n}</div>
                <span style={{ fontSize: "0.65rem", color: paso >= n ? verde : "#aaa", fontWeight: "600", whiteSpace: "nowrap" }}>{label}</span>
              </div>
              {i < 2 && <div style={{ flex: 1, height: "3px", background: paso > n ? "#8DC63F" : "#ddd", margin: "0 8px", marginBottom: "16px" }}></div>}
            </div>
          ))}
        </div>

        <div style={{ background: "white", borderRadius: "20px", padding: "32px", boxShadow: "0 4px 24px rgba(46,112,35,0.1)" }}>

          {/* PASO 1 */}
          {paso === 1 && (
            <>
              <h2 style={{ color: verde, margin: "0 0 24px", fontSize: "1.2rem", fontWeight: "800" }}>📋 Datos personales</h2>

              <div style={{ marginBottom: "18px" }}>
                <label style={estiloLabel}>Nombre</label>
                <input type="text" placeholder="Tu nombre" value={form.nombre} onChange={set("nombre")} style={estiloInput(errores.nombre)} />
                {errores.nombre && <p style={{ color: "#e53e3e", fontSize: "0.75rem", margin: "4px 0 0" }}>{errores.nombre}</p>}
              </div>

              <div style={{ marginBottom: "18px" }}>
                <label style={estiloLabel}>Apellidos</label>
                <input type="text" placeholder="Tus apellidos" value={form.apellidos} onChange={set("apellidos")} style={estiloInput(errores.apellidos)} />
                {errores.apellidos && <p style={{ color: "#e53e3e", fontSize: "0.75rem", margin: "4px 0 0" }}>{errores.apellidos}</p>}
              </div>

              <div style={{ marginBottom: "18px" }}>
                <label style={estiloLabel}>Departamento</label>
                <select value={form.departamento} onChange={set("departamento")} style={estiloInput(errores.departamento)}>
                  <option value="">-- Selecciona tu departamento --</option>
                  {DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                {errores.departamento && <p style={{ color: "#e53e3e", fontSize: "0.75rem", margin: "4px 0 0" }}>{errores.departamento}</p>}
              </div>

              <div style={{ marginBottom: "18px" }}>
                <label style={estiloLabel}>Especialidad</label>
                <input type="text" placeholder="Tu especialidad docente" value={form.especialidad} onChange={set("especialidad")} style={estiloInput(errores.especialidad)} />
                {errores.especialidad && <p style={{ color: "#e53e3e", fontSize: "0.75rem", margin: "4px 0 0" }}>{errores.especialidad}</p>}
              </div>
            </>
          )}

          {/* PASO 2 */}
          {paso === 2 && (
            <>
              <h2 style={{ color: verde, margin: "0 0 24px", fontSize: "1.2rem", fontWeight: "800" }}>💼 Datos laborales y rol</h2>

              <div style={{ marginBottom: "18px" }}>
                <label style={estiloLabel}>Tipo de funcionario</label>
                <select value={form.tipo} onChange={set("tipo")} style={estiloInput(errores.tipo)}>
                  <option value="">-- Selecciona el tipo --</option>
                  {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                {errores.tipo && <p style={{ color: "#e53e3e", fontSize: "0.75rem", margin: "4px 0 0" }}>{errores.tipo}</p>}
              </div>

              <div style={{ marginBottom: "18px" }}>
                <label style={estiloLabel}>Antigüedad en el centro (años)</label>
                <input type="number" placeholder="0" value={form.antiguedad_centro} onChange={set("antiguedad_centro")} style={estiloInput(errores.antiguedad_centro)} />
                {errores.antiguedad_centro && <p style={{ color: "#e53e3e", fontSize: "0.75rem", margin: "4px 0 0" }}>{errores.antiguedad_centro}</p>}
              </div>

              <div style={{ marginBottom: "18px" }}>
                <label style={estiloLabel}>Antigüedad en el cuerpo (años)</label>
                <input type="number" placeholder="0" value={form.antiguedad_cuerpo} onChange={set("antiguedad_cuerpo")} style={estiloInput(errores.antiguedad_cuerpo)} />
                {errores.antiguedad_cuerpo && <p style={{ color: "#e53e3e", fontSize: "0.75rem", margin: "4px 0 0" }}>{errores.antiguedad_cuerpo}</p>}
              </div>

              <div style={{ marginBottom: "18px" }}>
                <label style={estiloLabel}>Tu rol en el centro</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                  {ROLES.map(r => (
                    <div key={r.value} onClick={() => setRol(r.value)}
                      style={{ padding: "16px 12px", border: form.rol === r.value ? `2px solid ${verdeM}` : "2px solid #ddd", borderRadius: "12px", cursor: "pointer", textAlign: "center", background: form.rol === r.value ? verdeF : "white", transition: "all 0.2s" }}>
                      <div style={{ fontSize: "1.8rem", marginBottom: "6px" }}>{r.icono}</div>
                      <div style={{ fontSize: "0.78rem", fontWeight: "700", color: form.rol === r.value ? verde : "#444", marginBottom: "4px" }}>{r.label}</div>
                      <div style={{ fontSize: "0.65rem", color: "#888", lineHeight: "1.3" }}>{r.desc}</div>
                    </div>
                  ))}
                </div>
                {errores.rol && <p style={{ color: "#e53e3e", fontSize: "0.75rem", margin: "8px 0 0" }}>{errores.rol}</p>}
              </div>

              <div style={{ marginBottom: "18px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                  <input type="checkbox" checked={form.es_tutor} onChange={set("es_tutor")} style={{ width: "18px", height: "18px", accentColor: verde }} />
                  <span style={{ fontSize: "0.88rem", fontWeight: "600", color: "#444" }}>Soy tutor/a de grupo</span>
                </label>
              </div>

              {form.es_tutor && (
                <div style={{ marginBottom: "18px" }}>
                  <label style={estiloLabel}>Grupo asignado</label>
                  <input type="text" placeholder="Ej: 1ºESO-A, GM-1CAR..." value={form.grupo} onChange={set("grupo")} style={estiloInput(errores.grupo)} />
                  {errores.grupo && <p style={{ color: "#e53e3e", fontSize: "0.75rem", margin: "4px 0 0" }}>{errores.grupo}</p>}
                </div>
              )}
            </>
          )}

          {/* PASO 3 */}
          {paso === 3 && (
            <>
              <h2 style={{ color: verde, margin: "0 0 8px", fontSize: "1.2rem", fontWeight: "800" }}>🔒 Crea tu contraseña</h2>
              <p style={{ color: "#777", fontSize: "0.82rem", margin: "0 0 24px", lineHeight: "1.5" }}>Elige una contraseña segura con mínimo 8 caracteres.</p>

              <div style={{ marginBottom: "18px" }}>
                <label style={estiloLabel}>Contraseña</label>
                <input type="password" placeholder="Mínimo 8 caracteres" value={form.password} onChange={set("password")} style={estiloInput(errores.password)} />
                {errores.password && <p style={{ color: "#e53e3e", fontSize: "0.75rem", margin: "4px 0 0" }}>{errores.password}</p>}
              </div>

              <div style={{ marginBottom: "18px" }}>
                <label style={estiloLabel}>Repite la contraseña</label>
                <input type="password" placeholder="Repite tu contraseña" value={form.password2} onChange={set("password2")} style={estiloInput(errores.password2)} />
                {errores.password2 && <p style={{ color: "#e53e3e", fontSize: "0.75rem", margin: "4px 0 0" }}>{errores.password2}</p>}
              </div>

              <div style={{ background: verdeF, borderRadius: "12px", padding: "14px 16px" }}>
                <p style={{ margin: 0, fontSize: "0.78rem", color: verde, fontWeight: "600" }}>ℹ️ Tu solicitud quedará pendiente de aprobación por el secretario antes de poder acceder.</p>
              </div>
            </>
          )}

          {/* BOTONES */}
          <div style={{ display: "flex", gap: "12px", marginTop: "28px" }}>
            {paso > 1 && (
              <button onClick={() => setPaso(p => p - 1)}
                style={{ flex: 1, padding: "13px", border: `2px solid ${verdeM}`, borderRadius: "12px", background: "white", color: verde, fontWeight: "700", fontSize: "0.9rem", cursor: "pointer" }}>
                ← Anterior
              </button>
            )}
            <button onClick={siguiente}
              style={{ flex: 2, padding: "13px", border: "none", borderRadius: "12px", background: `linear-gradient(135deg,${verde},${verdeM})`, color: "white", fontWeight: "700", fontSize: "0.9rem", cursor: "pointer", boxShadow: "0 4px 14px rgba(46,112,35,0.3)" }}>
              {paso < 3 ? "Siguiente →" : "✅ Enviar solicitud"}
            </button>
          </div>

        </div>
      </main>
    </div>
  );
}
