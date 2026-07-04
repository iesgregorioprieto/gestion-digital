# 📋 Estado del Portal IES Gregorio Prieto — 3 julio 2026

> **Documento maestro de seguimiento** · Sesión 13
> Última actualización: 3 de julio de 2026

---

## ✅ RESUELTO HOY: Login funcionando en producción

El bloqueo de 2 días se resolvió: la `NEXT_PUBLIC_SUPABASE_ANON_KEY` en Vercel tenía una clave equivocada (terminaba en `...FMOKVVv0L4Kc`). La clave correcta termina en `...p7vg`. Se diagnosticó con un "login detective" temporal. **Nunca marcar variables `NEXT_PUBLIC_` como Sensitive en Vercel.**

---

## 🌐 Accesos y credenciales

| Recurso | Valor |
|---------|-------|
| **Portal** | https://gestion-digital.vercel.app |
| **GitHub** | github.com/iesgregorioprieto/gestion-digital |
| **Supabase** | kbqqenegrwfdfiqmptzb · Frankfurt |
| **Token GitHub** | TOKEN_GITHUB_PRIVADO |

### Usuarios de prueba
| Email | Contraseña | Rol |
|-------|-----------|-----|
| director@iesgregorioprieto.es | director2026 | director |
| llcc12@educastillalamancha.es | 1234 | secretario (Luis Javier) |
| jefe.prueba@iesgregorioprieto.es | jefe1234 | profesor + jefe_departamento |
| profesor.prueba@iesgregorioprieto.es | profe1234 | profesor |

---

## 📦 Módulos completados

### ✅ Login (`/login`)
- Funciona en producción
- Roles: profesor/tutor/jefe_departamento (array) + rol_gestion (secretario/director)

### ✅ Portada (`/`)
- Escudo del IES, tarjetas de acceso

### ✅ Registro (`/registro`)
- 3 pasos: datos → horario → confirmación
- Estado pendiente → aprobación por secretario

### ✅ Panel Profesor (`/profesor`)
- Tarjetas de módulos filtradas por rol
- Candado 🔐 para paneles directivos
- 🛒 Compras solo visible para jefes_departamento

### ✅ Panel Secretario (`/secretario`)
Pestañas activas:
- **👥 Profesores** — gestión completa, aprobar/rechazar registro
- **🛒 Compras** — ver solicitudes, filtros, gestionar, informe + ➕ Registrar compra directo
- **🔧 Mantenimiento** — ver incidencias, cambiar estado, comentar, eliminar, informe CSV

### ✅ Panel Director (`/director`)
- Calendario con días coloreados y 🔴 punto parpadeante en días con pendientes
- Punto desaparece al abrir el día
- Modal de revisión con alertas de conflicto mejoradas (normalización de nombres de grupo)
- Aprobar / Rechazar / Eliminar solicitudes DLD

### ✅ DLD (`/dld`)
- Formulario completo con horario por horas
- Guardia en CUALQUIER hora → desplegable tipo de guardia automático
- Grupos reales del IES (GM-2CAR, ESO-1A, GS-1DAW, etc.)
- Historial de solicitudes del profesor
- `guardias_horario` se envía a Supabase y el director lo ve

### ✅ Mantenimiento (`/mantenimiento`)
- 12 ubicaciones del centro
- Foto adjunta
- 3 pasos guiados

### ✅ Compras (`/compras`)
- **Solo accesible para jefes de departamento**
- Dos tipos: 🧾 Ya comprado / 🛍️ Necesito que lo pidas
- Carrito con varios artículos
- IVA desglosado por artículo (0%, 4%, 10%, 21%)
- Albarán global adjunto (foto/PDF) con botón visual claro
- Historial con estado en tiempo real
- Flujo: Pendiente → Aprobada → Comprado → Eliminada

---

## 🗄️ Tablas Supabase

| Tabla | Columnas clave |
|-------|---------------|
| `profesores` | id, nombre, apellidos, email, departamento, especialidad, tipo_contrato, antiguedad_centro, antiguedad_cuerpo, rol (array), rol_gestion, estado, password_hash |
| `dld` | id, profesor_id, profesor_nombre, tipo_contrato, tipo_dld, fecha_solicitada, grupos_afectados (jsonb), guardias_horario (jsonb), causa_sobrevenida, estado, created_at |
| `mantenimiento` | id, profesor_id, profesor_nombre, estancia, ubicacion_exacta, descripcion, foto_url, estado, comentario_secretario, created_at |
| `compras` | id, profesor_id, profesor_nombre, departamento, tipo, estado, comentario_secretario, proveedor, articulos (jsonb), albaran_url, total_estimado, created_at |

### Storage buckets
- `mantenimiento-fotos` — público
- `compras-docs` — público (albaranes y presupuestos)

### RLS deshabilitado en todas las tablas
`GRANT ALL ON [tabla] TO anon, authenticated`

---

## ⚠️ Pendientes antes de producción real
- [ ] Cifrado de contraseñas (ahora en texto plano)
- [ ] Restaurar contraseña real de Luis Javier (ahora: 1234)
- [ ] Cambiar contraseña del director por la definitiva

---

## 🔜 PRÓXIMA SESIÓN: Módulo de Autorizaciones

### Contexto
El tutor rellena a principios de curso un **Formulario de Autorización Múltiple de Grupo**.
Recoge los alumnos que **NO están autorizados** (los que no aparecen = autorizados para todo).

### 5 tipos de autorización (del formulario real del centro)
| # | Colectivo | Concepto |
|---|-----------|---------|
| 4 | Menores 14 años | 📸 Grabación/difusión de imágenes |
| 5 | Mayores 14 años | 📸 Grabación/difusión de imágenes |
| 6 | 16 ó 17 años | 🚪 Salidas recreo/última hora sin profesor |
| 7 | Menores 18 años | 🎒 Actividades extracurriculares en Valdepeñas (sin coste) |
| 8 | Mayores 18 años | 📊 Informar a progenitores de datos académicos |

### Propuesta de diseño aprobada
- **NO usar Excel de Delphos** para gestionar — solo para cargar el listado de alumnos
- El tutor rellena el formulario **dentro del portal**, alumno por alumno
- Los alumnos se cargan del listado real (`datUnidades.xls`)
- El profesor busca un alumno y ve sus restricciones al instante
- El jefe de estudios ve qué grupos han rellenado el formulario y cuáles no

### Flujo propuesto
1. Tutor entra al módulo → selecciona su grupo → ve lista de alumnos
2. Por cada alumno marca qué NO está autorizado
3. Guarda → queda registrado en Supabase
4. Cualquier profesor puede buscar un alumno y ver sus restricciones
5. Jefe de estudios ve el estado de todos los grupos

### Pendiente de decidir
- Estructura de la tabla `alumnos` en Supabase
- Cómo cargar el listado inicial desde Delphos/Excel
- Quién puede consultar (¿todos los profesores o solo tutor + jefatura?)

---

## 🔑 Patrones y reglas del proyecto

- **`getSupabase()`** — siempre lazy, nunca a nivel de módulo
- **Nunca `.single()`** — usar array y `rows[0]`
- **`NEXT_PUBLIC_` nunca como Sensitive** en Vercel
- **Redesplegar tras cambiar variables** de entorno
- **Lego method** — cada módulo se prueba antes de integrar
- **Claude sube directo** por GitHub API, sin copiar-pegar

---

## 📱 Acceso móvil
El portal funciona desde cualquier dispositivo. Para instalarlo como app:
- **Android:** Chrome → ⋮ → "Añadir a pantalla de inicio"
- **iPhone:** Safari → compartir → "Añadir a pantalla de inicio"

*Versión 13 — Sesión 13. Login resuelto. Módulos: Login, Portada, Registro, Profesor, Secretario (Profesores+Compras+Mantenimiento), Director, DLD, Mantenimiento, Compras. Próximo: Módulo Autorizaciones de alumnos.*
