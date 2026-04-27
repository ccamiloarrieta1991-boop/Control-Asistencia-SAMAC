# 🏫 Control de Asistencia — PWA

App móvil instalable para control de asistencia escolar.

---

## 🚀 Despliegue en Vercel (GRATIS) — 3 pasos

### Paso 1: Sube el código a GitHub
1. Ve a https://github.com y crea una cuenta gratuita
2. Crea un nuevo repositorio → "New repository"
3. Nombre: `control-asistencia` → Create repository
4. Sube todos estos archivos al repositorio

### Paso 2: Conecta con Vercel
1. Ve a https://vercel.com y accede con tu cuenta GitHub
2. Clic en "Add New Project"
3. Selecciona tu repositorio `control-asistencia`
4. Vercel detecta automáticamente que es Vite → clic "Deploy"
5. ¡Listo! En ~2 minutos tienes tu URL: `https://control-asistencia.vercel.app`

### Paso 3: Instala en Android
1. Abre Chrome en tu Android
2. Ve a tu URL de Vercel
3. Aparece banner "Agregar a pantalla de inicio" → tócalo
4. ¡La app queda instalada como si fuera nativa!

---

## 💻 Desarrollo local

```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev

# Construir para producción
npm run build
```

---

## 📁 Estructura del proyecto

```
attendance-pwa/
├── public/
│   └── icons/          ← Íconos de la app (agregar icon-192.png y icon-512.png)
├── src/
│   ├── App.jsx         ← Aplicación principal
│   ├── main.jsx        ← Punto de entrada
│   └── index.css       ← Estilos globales
├── index.html
├── package.json
└── vite.config.js      ← Configuración PWA
```

---

## 📱 Funcionalidades

- ✅ Selección de grado
- ✅ Lista de estudiantes por grado
- ✅ Marcadores: Asistió / No Asistió / Excusa / Tarde
- ✅ Marcado masivo + modificación individual
- ✅ Fecha automática (hoy)
- ✅ **Importación desde Excel** (columnas: Nombre, Grado)
- ✅ Agregar/eliminar estudiantes
- ✅ Reporte por grado y rango de fechas
- ✅ Vista detalle diario
- ✅ Exportación a Excel
- ✅ Gráficas de barras y pastel
- ✅ Datos guardados localmente en el dispositivo
- ✅ Funciona offline
- ✅ Instalable como APK (PWA)

---

## 💾 Almacenamiento

Los datos se guardan en **localStorage** del navegador del dispositivo.
Para respaldo, usa la exportación a Excel regularmente.

---

## 📋 Plantilla Excel para importar estudiantes

| Nombre        | Grado    |
|--------------|----------|
| Ana García   | 1° Grado |
| Luis Martínez | 2° Grado |

Descarga la plantilla desde la pestaña 👥 Estudiantes → "Descargar plantilla"
