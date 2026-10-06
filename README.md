# ✦ NOIR STORE ✦

Sistema de gestión para tiendas y almacenes (ropa o cualquier negocio con inventario), por **Noir Studio**.

Punto de venta · Inventario con tallas y colores · Cotizaciones · Facturación · Créditos con interés y cuotas · Caja · Compras y proveedores · Gastos · Reportes · Apartados · Programa de puntos · Promociones · Notificaciones por WhatsApp · Suscripción por licencia (planes Básica y Premium) · Base de datos SQL (SQLite).

## Cómo iniciarlo

1. Instala [Node.js](https://nodejs.org) 22.13 o superior (incluye SQLite, no hace falta nada más).
2. Haz doble clic en **`INICIAR NOIR STORE.bat`** (o ejecuta `node server.js`).
3. Abre `http://localhost:8080`. Otros equipos de la misma red usan la dirección que muestra la ventana.

Sin Node.js también funciona abriendo `index.html`, pero los datos quedan solo en ese navegador.

## Estructura

| Ruta | Contenido |
|---|---|
| `index.html`, `css/`, `js/` | Aplicación (HTML, CSS y JavaScript sin dependencias) |
| `js/pages/` | Pantallas: punto de venta, productos, facturas, créditos, caja, reportes, configuración… |
| `server.js` | Servidor local: archivos, API y licencias |
| `db-sql.js` | Base de datos SQL (SQLite): tablas, vistas para reportes y respaldos |
| `js/provision.js` | Configuración de entrega que genera el Panel de Licencias para cada cliente |
| `data/` | Base de datos y respaldos del negocio (**no se sube al repositorio**) |

El Panel de Licencias y la clave privada que firma los códigos de activación **no** forman parte de este repositorio.
