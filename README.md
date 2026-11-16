# ShipNow API

API REST de logística para gestionar usuarios, productos, pedidos y entregas. Proyecto integrador de **Programación Backend III** (CoderHouse).

**Estado actual:** Pre-entrega 7 — carga de archivos, documentos y comprobantes con Multer.

## Tecnologías

- Node.js 24 con ES Modules
- Express 5
- MongoDB Atlas + Mongoose 9
- dotenv
- Mocha + Chai + Supertest + mongodb-memory-server (tests)
- Winston + winston-daily-rotate-file (logging)
- Swagger / OpenAPI 3 (swagger-jsdoc + swagger-ui-express)
- Multer (carga de archivos)

## Instalación y ejecución local

1. Clonar el repositorio e instalar dependencias:

```bash
git clone https://github.com/iTzTomitox/shipnow-api.git
cd shipnow-api
npm install
```

2. Crear el archivo `.env` a partir del modelo y completar los valores:

```bash
cp .env.example .env
```

3. Levantar el servidor en modo desarrollo (se reinicia solo al guardar cambios):

```bash
npm run dev
```

4. Correr los tests:

```bash
npm test
```

## Variables de entorno

| Variable | Descripción | Ejemplo |
|---|---|---|
| `PORT` | Puerto del servidor | `3000` |
| `MONGODB_URI` | URI de conexión a MongoDB (la de tu cluster de Atlas) | `mongodb+srv://<usuario>:<clave>@<cluster>/shipnow` |
| `NODE_ENV` | Entorno de ejecución: `development`, `test` o `production` | `development` |
| `LOG_LEVEL` | Nivel mínimo de logs (opcional): `fatal`, `error`, `warning`, `info`, `http` o `debug`. Por defecto `debug` fuera de producción e `info` en producción | `debug` |
| `UPLOADS_DIR` | Carpeta donde se guardan los archivos subidos (opcional, por defecto `uploads`) | `uploads` |

`PORT`, `MONGODB_URI` y `NODE_ENV` son obligatorias; `LOG_LEVEL` y `UPLOADS_DIR` son opcionales. La configuración se valida al arrancar (`src/config/buildConfig.js`): si falta alguna o tiene un valor inválido, la app **no arranca** y muestra un error descriptivo. Por ejemplo:

```
Error: Faltan variables de entorno críticas: MONGODB_URI. Revisá tu archivo .env (el modelo está en .env.example)
```

`process.env` se lee **únicamente** en `src/config/env.config.js`; el resto del proyecto importa el objeto de configuración ya validado y congelado.

## Estructura del proyecto

```
src/
├── config/          # buildConfig (validación), env.config (único lector de process.env), db, logger
├── constants/       # roles y estados del dominio (Object.freeze)
├── controllers/     # única puerta de entrada HTTP: req/res y status codes
├── docs/            # Swagger: configuración y documentación OpenAPI en YAML
├── errors/          # AppError y diccionario de errores (código → HTTP + mensaje)
├── middlewares/     # 404 de rutas inexistentes y middleware global de errores
├── mocks/           # generadores de datos simulados (funciones puras, sin base de datos)
├── models/          # esquemas de Mongoose, sin lógica
├── repositories/    # único lugar que conoce Mongoose/MongoDB
├── routes/          # solo conectan path con método del controller
├── services/        # reglas de negocio
├── utils/           # helpers (archivos: metadatos, mover y borrar)
├── app.js           # arma Express (sin abrir puerto)
└── server.js        # conecta a MongoDB y levanta el servidor
tests/
├── setup.js         # entorno de testing + MongoDB en memoria (root hooks de Mocha)
├── unit/            # reglas de negocio con repositories falsos (sin base de datos)
└── functional/      # endpoints reales con Supertest contra MongoDB en memoria
uploads/             # archivos subidos (se crea en ejecución, ignorada por git)
```

## Arquitectura por capas

```
Request → Router → Controller → Service → Repository → Model / MongoDB
```

Cada capa solo conoce a la siguiente. El Controller nunca importa Mongoose, y el Service no recibe `req` ni `res`.

Las dependencias se inyectan por constructor (`new ProductsService(productsRepository)`). Eso permite testear los services con un repository falso, sin base de datos.

`app.js` está separado de `server.js` para que los tests puedan importar la app sin abrir un puerto.

## Por qué separé la lógica entre Service y Repository

El criterio fue: **el Service decide, el Repository ejecuta.**

**En el Service** quedó todo lo que es una regla del negocio, es decir, algo que cambiaría si cambia el negocio:

- **El estado de un producto se calcula a partir del stock.** Si `stock` es 0 queda `OUT_OF_STOCK`; si no, `AVAILABLE`. El cliente no puede mandarlo. Si mañana se agrega un estado "stock bajo", solo cambia el Service.
- **Ocultar los productos sin stock** en el listado es una decisión de negocio. El Service decide pedir solo los `AVAILABLE`, salvo que se envíe `?includeOutOfStock=true`.
- **El email único con 409.** Que no puedan existir dos usuarios con el mismo email es una regla; el Service consulta y decide responder conflicto. En un update solo es conflicto si el email pertenece a **otro** usuario.
- **Validaciones y lista blanca.** Precio y stock no negativos, rol válido según las constantes. Solo se guardan los campos permitidos y el resto del body se descarta.

**En el Repository** quedó todo lo que es acceso a datos, que cambiaría si cambia la base de datos y no el negocio:

- **Proyección por defecto:** nunca devuelve el campo interno `__v`.
- **Orden por defecto:** los más nuevos primero.
- **`.lean()`:** devuelve objetos planos en lugar de documentos de Mongoose.
- **Ids con formato inválido:** devuelve `null` en lugar de dejar escapar un `CastError` de Mongoose. Así el Service solo ve "no existe" y responde 404, sin saber qué es un ObjectId.
- **Filtros:** sabe filtrar por `status` o `role` cuando se lo piden, pero no decide cuándo filtrar.

Con esta separación, las reglas de negocio se testean sin MongoDB (ver `tests/unit/`), y cambiar la base de datos solo tocaría la capa de repositories.

## Constantes del dominio

Roles y estados se definen una sola vez en `src/constants/index.js`, congelados con `Object.freeze`. En el código nunca se usan strings sueltos como `'admin'`; se usa `USER_ROLES.ADMIN`. Los modelos toman sus `enum` de estas constantes.

| Constante | Valores |
|---|---|
| `USER_ROLES` | `admin`, `user`, `driver` |
| `PRODUCT_STATUS` | `available`, `out_of_stock` |
| `ORDER_STATUS` | `created`, `assigned`, `picked_up`, `in_transit`, `delivered`, `cancelled` |
| `ORDER_TRANSITIONS` | Mapa de transiciones válidas entre estados del pedido |
| `DELIVERY_PRIORITY` | `low`, `normal`, `high` |
| `DELIVERY_STATUS` | `pending`, `assigned`, `in_transit`, `delivered` |
| `MAX_MOCK_ITEMS` | `100` (máximo de registros por pedido de mocks) |

`src/utils/constants.js` re-exporta el mismo contenido (la consigna menciona las dos rutas).

## Documentación interactiva (Swagger)

Con el servidor levantado (`npm run dev`), la documentación está en:

- **Swagger UI:** [http://localhost:3000/api/docs](http://localhost:3000/api/docs), para consultar y probar cada endpoint con "Try it out".
- **Especificación OpenAPI en JSON:** [http://localhost:3000/api/docs.json](http://localhost:3000/api/docs.json)

La configuración está separada de las rutas: `src/docs/swagger.config.js` define la información general (nombre, versión, descripción y servidor local) y junta los archivos YAML de `src/docs/`. Ningún router contiene documentación.

| Archivo | Contenido |
|---|---|
| `schemas.yaml` | Schemas reutilizables (usuario, producto, pedido, item de pedido, entrega, tracking, mocks, respuesta exitosa y respuesta de error), parámetros de ruta y un ejemplo por cada código de error |
| `users.yaml`, `products.yaml`, `orders.yaml`, `deliveries.yaml` | Endpoints de cada módulo: método, descripción, parámetros, body, respuesta exitosa y cada error posible |
| `mocks.yaml` | Endpoints de mocks y sus alias del temario |
| `logger.yaml` | `GET /api/loggerTest` (herramienta interna) |

**Módulos documentados (tags):** Users, Products, Orders, Deliveries, Mocks y Logger.

Aclaraciones para probar desde Swagger UI:

- Los endpoints con `{uid}`, `{pid}`, `{oid}` o `{did}` necesitan ids reales: se obtienen del listado correspondiente (por ejemplo, `GET /api/users?role=driver` para un repartidor). `POST /api/mocks/seed` carga datos de prueba si la base está vacía.
- Cuando un mismo status tiene varios errores posibles (por ejemplo, el 404 al crear un pedido puede ser `USER_NOT_FOUND` o `PRODUCT_NOT_FOUND`), Swagger UI muestra un desplegable con un ejemplo por código. Los ejemplos usan exactamente los códigos, mensajes y status del diccionario de errores.
- Los pedidos y entregas se documentan con dos schemas porque la API devuelve formas distintas: al crear, el cliente o el pedido vienen como id (`Order`, `Delivery`); al leer, vienen con sus datos (`OrderDetail`, `DeliveryDetail`).
- Swagger está disponible en todos los entornos. **Mocks y Logger solo se documentan fuera de producción**, igual que sus rutas: con `NODE_ENV=production` no se montan y tampoco aparecen en la especificación.

## Endpoints

Todas las respuestas exitosas tienen la forma `{ "status": "success", "payload": ... }`. Los errores siguen el formato descrito en [Manejo de errores](#manejo-de-errores).

### Paginación de los listados

Los cuatro listados (`GET /api/products`, `/api/users`, `/api/orders` y `/api/deliveries`) están paginados, así nunca devuelven la colección completa. Se combinan con los filtros de cada uno.

| Query | Por defecto | Reglas |
|---|---|---|
| `page` | `1` | Entero mayor o igual a 1 |
| `limit` | `10` | Entero entre 1 y 100 |

Un valor inválido responde 400 `VALIDATION_ERROR`. El orden es estable (más nuevos primero, con `_id` de desempate), así ningún elemento se repite ni se saltea entre páginas. `payload` sigue siendo la lista, y los metadatos van al lado:

```json
{
  "status": "success",
  "payload": [],
  "pagination": { "page": 2, "limit": 10, "total": 37, "totalPages": 4, "hasNextPage": true, "hasPrevPage": true }
}
```

### Health check — `/api/health`

| Método | Ruta | Body | Descripción |
|---|---|---|---|
| GET | `/api/health` | — | 200 con `status`, `environment`, `uptime` (segundos), `timestamp` y `database`; 503 `SERVICE_UNAVAILABLE` si no hay conexión con MongoDB |

Lo usan Docker y el monitoreo para saber si la API puede atender. No expone información sensible (ni la URI de la base, ni credenciales, ni versiones) y no se registra en los logs de requests, para no llenarlos de ruido.

### Productos — `/api/products`

| Método | Ruta | Body | Descripción |
|---|---|---|---|
| GET | `/api/products` | — | Lista los productos disponibles |
| GET | `/api/products?includeOutOfStock=true` | — | Lista todos, incluso sin stock |
| GET | `/api/products/:pid` | — | Obtiene un producto (404 si no existe) |
| POST | `/api/products` | `{"name": "Caja chica", "price": 1500, "stock": 10}` | Crea un producto (201) |
| PUT | `/api/products/:pid` | `{"stock": 0}` | Actualiza campos; si cambia el stock, recalcula el estado |
| DELETE | `/api/products/:pid` | — | Elimina un producto |

### Usuarios — `/api/users`

| Método | Ruta | Body | Descripción |
|---|---|---|---|
| GET | `/api/users` | — | Lista los usuarios |
| GET | `/api/users?role=driver` | — | Filtra por rol (400 si el rol es inválido) |
| GET | `/api/users/:uid` | — | Obtiene un usuario (404 si no existe) |
| POST | `/api/users` | `{"firstName": "Ana", "lastName": "Pérez", "email": "ana@test.com"}` | Crea un usuario con rol `user` por defecto (409 si el email ya existe) |
| PUT | `/api/users/:uid` | `{"role": "driver"}` | Actualiza campos |
| DELETE | `/api/users/:uid` | — | Elimina un usuario |

### Pedidos — `/api/orders`

| Método | Ruta | Body | Descripción |
|---|---|---|---|
| GET | `/api/orders` | — | Lista los pedidos, con los datos del cliente |
| GET | `/api/orders?status=created` | — | Filtra por estado (400 `INVALID_ORDER_STATUS` si no existe) |
| GET | `/api/orders/:oid` | — | Obtiene un pedido (404 `ORDER_NOT_FOUND`) |
| POST | `/api/orders` | `{"customer": "ID_USUARIO", "items": [{"product": "ID_PRODUCTO", "quantity": 2}], "deliveryAddress": "Av. Siempre Viva 742", "priority": "high"}` | Crea un pedido (201) |
| PATCH | `/api/orders/:oid/status` | `{"status": "picked_up"}` | Cambia el estado respetando las transiciones válidas (`assigned` solo se alcanza asignando repartidor) |
| GET | `/api/orders/:oid/tracking` | — | Seguimiento: estado del pedido + su entrega y repartidor (`delivery: null` si todavía no tiene) |

Al crear un pedido, el cliente envía solo el id y la cantidad de cada producto. El service valida que el cliente exista y tenga rol `user`, y que cada producto exista y esté `available`. Copia el nombre y el precio de cada producto (snapshot), calcula el `total` y fija el estado `created`. `priority` es opcional (`low`, `normal` o `high`; por defecto `normal`).

Transiciones de estado válidas:

```
created ──→ assigned ──→ picked_up ──→ in_transit ──→ delivered
   │            │
   └────────────┴──→ cancelled     (solo antes de que lo retiren)
```

`delivered` y `cancelled` son estados finales. El cambio de estado se escribe de forma condicional (`findOneAndUpdate` filtrando por el estado actual), así dos requests simultáneas no pueden aplicar transiciones incompatibles.

### Entregas — `/api/deliveries`

| Método | Ruta | Body | Descripción |
|---|---|---|---|
| GET | `/api/deliveries` | — | Lista entregas, con el resumen del pedido y los datos del repartidor |
| GET | `/api/deliveries?status=assigned&driver=ID_REPARTIDOR` | — | Filtra por estado y/o repartidor (400 `INVALID_DELIVERY_STATUS` si el estado no existe) |
| GET | `/api/deliveries/:did` | — | Obtiene una entrega (404 `DELIVERY_NOT_FOUND`) |
| POST | `/api/deliveries` | `{"order": "ID_PEDIDO"}` | Crea la entrega de un pedido `created`: nace `pending` y sin repartidor (201) |
| PATCH | `/api/deliveries/:did/assign` | `{"driver": "ID_REPARTIDOR"}` | Asigna un repartidor: la entrega **y el pedido** pasan a `assigned` |

Reglas:

- Solo se crea la entrega de un pedido `created`, y un pedido tiene **una sola** entrega (409 `DELIVERY_ALREADY_EXISTS`).
- Para asignar, la entrega tiene que estar `pending` (409 `DELIVERY_ALREADY_ASSIGNED`) y el usuario tiene que tener rol `driver` (400 `VALIDATION_ERROR`).
- `assigned` significa "tiene repartidor", así que **solo** se alcanza por este endpoint. `PATCH /api/orders/:oid/status` con `{"status": "assigned"}` responde 409 `INVALID_STATUS_TRANSITION`. Los estados siguientes (`picked_up`, `in_transit`, `delivered`) se avanzan desde el pedido.

Flujo completo de un envío:

```
POST /api/orders                      → pedido created
POST /api/deliveries                  → entrega pending
PATCH /api/deliveries/:did/assign     → entrega y pedido assigned
PATCH /api/orders/:oid/status         → picked_up → in_transit → delivered
GET /api/orders/:oid/tracking         → estado del pedido + entrega + repartidor en cualquier momento
```

### Mocks — `/api/mocks`

Herramienta de desarrollo y testing para generar datos simulados con [`@faker-js/faker`](https://fakerjs.dev/) (en español). **No se monta en producción** (`NODE_ENV=production`). Cada endpoint responde también en un alias con el nombre usado en el temario del curso.

**Datos simulados sin guardar** (`?qty=N`, entero entre 0 y 100, por defecto 5):

| Método | Ruta | Alias | Qué genera |
|---|---|---|---|
| GET | `/api/mocks/users?qty=2` | `/api/mocks/mockingusers` | Usuarios con rol `user` o `driver` (~30% repartidores) |
| GET | `/api/mocks/products?qty=3` | `/api/mocks/mockingproducts` | Productos con `status` coherente con el `stock` (~15% sin stock) |
| GET | `/api/mocks/orders?qty=2` | `/api/mocks/mockingorders` | Pedidos con items que referencian productos, `total` calculado, estado `created` y prioridad aleatoria |
| GET | `/api/mocks/deliveries?qty=2` | `/api/mocks/mockingdeliveries` | Entregas asociadas a pedidos simulados: `pending` sin repartidor; `assigned`, `in_transit` o `delivered` con repartidor |

**Carga de datos de prueba en MongoDB:**

| Método | Ruta | Body | Respuesta (`payload`) |
|---|---|---|---|
| POST | `/api/mocks/seed?qty=10` | — | `{"insertados": 10, "coleccion": "users"}` |
| POST | `/api/mocks/seed` (alias `/api/mocks/generateData`) | `{"users": 10, "products": 5, "orders": 8, "deliveries": 5}` | `{"insertados": {"users": 10, "products": 5, "orders": 8, "deliveries": 5}}` |

El seed completo inserta en orden **usuarios → productos → pedidos → entregas**, usando los `_id` reales de cada paso, y respeta estas reglas:

- Cada pedido pertenece a un usuario con rol `user` del mismo seed, y cada item referencia un producto insertado (con copia del nombre y precio).
- Los primeros `deliveries` pedidos llevan entrega. Su estado (`assigned`, `picked_up`, `in_transit` o `delivered`) exige un repartidor con rol `driver`. Si el seed no tiene repartidores, quedan en `created` con la entrega `pending` y sin repartidor.
- Los pedidos sin entrega quedan `created` o `cancelled`. Un pedido cancelado nunca tiene entrega.

Casos inválidos (todos responden 400 `INVALID_MOCK_AMOUNT`, con el motivo en `details`):

| Body | Motivo |
|---|---|
| `{"users": "muchos"}` | No es un número entero |
| `{"users": -1}` | Negativo |
| `{"users": 500}` | Supera el máximo de 100 |
| `{"users": 0, "orders": 0}` | Ninguna cantidad mayor a 0 |
| `{"users": 5, "orders": 3}` | Pedidos sin productos en el mismo seed |
| `{"users": 3, "products": 2, "orders": 2, "deliveries": 5}` | Más entregas que pedidos |

### Logger — `/api/loggerTest`

| Método | Ruta | Body | Descripción |
|---|---|---|---|
| GET | `/api/loggerTest` | — | Herramienta interna: genera un log en cada nivel (no se monta en producción). Ver [Logging](#logging) |

## Carga de archivos

Implementada con [Multer](https://github.com/expressjs/multer). La configuración está centralizada en `src/middlewares/upload.middleware.js`, separada de los routers: dónde se guarda cada archivo, cómo se nombra, qué formatos se aceptan y el tamaño máximo.

| Endpoint | Campo de archivo | Campos adicionales | Qué hace |
|---|---|---|---|
| `POST /api/users/:uid/documents` | `document` | `type` (opcional): `user_document` (por defecto) o `driver_license` | Agrega un documento al usuario. La licencia solo se acepta para usuarios con rol `driver` |
| `POST /api/orders/:oid/proof` | `proof` | — | Comprobante de entrega. Con el pedido `in_transit` lo guarda y el pedido pasa a `delivered`; con el pedido `delivered` reemplaza el anterior. En cualquier otro estado responde 409 |

Las dos rutas reciben `multipart/form-data` y responden con la entidad actualizada (el usuario con su lista de documentos, o el pedido con su comprobante).

**Validaciones:** formatos PDF, JPG y PNG; tamaño máximo 5 MB (Multer corta la subida mientras se recibe); un solo archivo, en el campo esperado; tipo de documento válido; entidad existente. Todos los errores responden con el formato general de la API (ver [Manejo de errores](#manejo-de-errores)).

### Dónde se guardan

```
uploads/
├── documents/   ← documentos de usuario
├── licenses/    ← licencias de repartidor
└── proofs/      ← comprobantes de entrega
```

Las carpetas se crean solas la primera vez que se usan. **`uploads/` está en `.gitignore`**: los archivos subidos nunca se versionan. La ubicación se puede cambiar con la variable opcional `UPLOADS_DIR`.

Cada archivo se guarda con un **nombre generado por el servidor** (fecha + identificador aleatorio + extensión según el formato). El nombre que manda el cliente no se usa en el disco, así se evitan choques entre archivos y ataques de *path traversal* (nombres como `../../archivo`).

### Qué se guarda en MongoDB

**Solo los metadatos, nunca el archivo:** el usuario tiene una lista `documents` y el pedido un campo `proof`, con la misma forma:

```json
{
  "originalName": "licencia.pdf",
  "fileName": "1794627076851-b5984307-90f0-4d24-adbf-dd263f3ee54a.pdf",
  "path": "uploads/licenses/1794627076851-b5984307-90f0-4d24-adbf-dd263f3ee54a.pdf",
  "mimeType": "application/pdf",
  "size": 24533,
  "type": "driver_license",
  "uploadedAt": "2026-11-14T00:31:16.000Z"
}
```

### Sin archivos huérfanos

Multer guarda el archivo **antes** de que el service valide la petición. Si después la validación falla (usuario o pedido inexistente, tipo de documento inválido, pedido en un estado que no admite comprobante), el service **borra el archivo del disco** antes de responder el error. Al reemplazar un comprobante, el archivo anterior también se borra. Ninguna petición fallida deja archivos sin asociar en `uploads/`.

Los tests suben sus archivos a una carpeta temporal dentro de `node_modules/.cache` y la borran al terminar: la suite nunca deja archivos en `uploads/`.

### Logging

Se registran las cargas exitosas y los comprobantes asociados (`info`), y los intentos fallidos con su motivo, como formato no permitido, tamaño excedido o tipo de documento inválido (`warning`, desde el middleware de errores).

### Probar la carga de archivos

Desde Swagger UI (`/api/docs`), los dos endpoints tienen un botón para elegir el archivo. Desde la terminal:

```bash
curl -F "document=@./dni.pdf" http://localhost:3000/api/users/ID_USUARIO/documents
```

```bash
curl -F "document=@./licencia.png" -F "type=driver_license" http://localhost:3000/api/users/ID_REPARTIDOR/documents
```

```bash
curl -F "proof=@./comprobante.jpg" http://localhost:3000/api/orders/ID_PEDIDO_IN_TRANSIT/proof
```

## Manejo de errores

Todos los errores salen de **un único lugar**: el middleware global `src/middlewares/errorHandler.middleware.js`. Los services detectan el problema y lanzan un `AppError` con un código del diccionario (`src/errors/errorDictionary.js`); los controllers lo derivan con `next(error)`; el middleware arma la respuesta. Ninguna ruta ni controller responde errores por su cuenta.

### Estructura de la respuesta de error

```json
{
  "status": "error",
  "error": "ORDER_NOT_FOUND",
  "message": "No se encontró el pedido solicitado",
  "details": "información del caso concreto"
}
```

| Campo | Contenido |
|---|---|
| `status` | Siempre `"error"` |
| `error` | Código interno estable del diccionario (lo usan los tests y Swagger) |
| `message` | Mensaje fijo asociado a ese código |
| `details` | Detalle del caso concreto, como qué campo falló. **Solo fuera de producción**: con `NODE_ENV=production` se omite, y un error 500 nunca expone el error interno |

### Diccionario de errores

| Código | HTTP | Cuándo ocurre |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Datos con formato inválido o faltantes |
| `INVALID_JSON` | 400 | El body no es un JSON válido |
| `INVALID_USER_ROLE` | 400 | Rol que no está en `USER_ROLES` |
| `ORDER_ITEMS_REQUIRED` | 400 | Pedido sin items, o item sin `product` o con `quantity` < 1 |
| `INVALID_ORDER_STATUS` | 400 | Estado de pedido inexistente (por ejemplo `on_the_way`) |
| `INVALID_DELIVERY_STATUS` | 400 | Estado de entrega inexistente en un filtro |
| `FILE_REQUIRED` | 400 | La petición no trae archivo |
| `INVALID_FILE_TYPE` | 400 | Formato distinto de PDF, JPG o PNG |
| `INVALID_DOCUMENT_TYPE` | 400 | `type` inexistente, o licencia para un usuario que no es repartidor |
| `UNEXPECTED_FILE_FIELD` | 400 | El archivo vino en un campo distinto de `document` o `proof` |
| `INVALID_MOCK_AMOUNT` | 400 | Cantidad de mocks inválida, negativa, mayor a 100 o incoherente |
| `ROUTE_NOT_FOUND` | 404 | La ruta no existe |
| `USER_NOT_FOUND` | 404 | Usuario inexistente |
| `PRODUCT_NOT_FOUND` | 404 | Producto inexistente |
| `ORDER_NOT_FOUND` | 404 | Pedido inexistente |
| `DELIVERY_NOT_FOUND` | 404 | Entrega inexistente |
| `USER_ALREADY_EXISTS` | 409 | Email ya registrado |
| `DUPLICATE_RESOURCE` | 409 | Índice único violado en MongoDB |
| `PRODUCT_NOT_AVAILABLE` | 409 | Producto sin stock en un pedido |
| `INVALID_STATUS_TRANSITION` | 409 | Cambio de estado no permitido desde el estado actual del pedido |
| `DELIVERY_ALREADY_EXISTS` | 409 | El pedido ya tiene una entrega |
| `DELIVERY_ALREADY_ASSIGNED` | 409 | La entrega ya no está `pending` (ya tiene repartidor) |
| `ORDER_NOT_DELIVERABLE` | 409 | El pedido no está `created` (por ejemplo, está cancelado o ya asignado) |
| `MOCK_GENERATION_ERROR` | 500 | Falló la inserción de mocks en MongoDB |
| `FILE_TOO_LARGE` | 413 | El archivo supera los 5 MB |
| `PAYLOAD_TOO_LARGE` | 413 | El body JSON supera los 100 KB |
| `FILE_UPLOAD_ERROR` | 500 | No se pudo guardar el archivo en disco |
| `SERVICE_UNAVAILABLE` | 503 | Health check sin conexión con MongoDB |
| `DATABASE_ERROR` | 500 | MongoDB inaccesible |
| `INTERNAL_SERVER_ERROR` | 500 | Error inesperado |

Los errores que no lanza la aplicación también se traducen al formato común: un JSON mal formado pasa a `INVALID_JSON`, una validación de Mongoose a `VALIDATION_ERROR`, un índice único violado (E11000) a `DUPLICATE_RESOURCE`, MongoDB caído a `DATABASE_ERROR` y cualquier otro a `INTERNAL_SERVER_ERROR`.


### Cómo probar los casos inválidos

Con el servidor levantado (`npm run dev`):

| Método | Ruta | Body | Respuesta esperada |
|---|---|---|---|
| GET | `/api/noexiste` | — | 404 `ROUTE_NOT_FOUND` |
| GET | `/api/products/123` | — | 404 `PRODUCT_NOT_FOUND` |
| POST | `/api/products` | `{"name": "Caja", "price": -10, "stock": 1}` | 400 `VALIDATION_ERROR` |
| GET | `/api/users?role=superadmin` | — | 400 `INVALID_USER_ROLE` |
| POST | `/api/users` | `{"firstName": "Ana", "lastName": "Pérez", "email": "ana.com"}` | 400 `VALIDATION_ERROR` |
| GET | `/api/orders/123` | — | 404 `ORDER_NOT_FOUND` |
| POST | `/api/orders` | `{"customer": "ID_USUARIO", "items": [], "deliveryAddress": "Calle 1"}` | 400 `ORDER_ITEMS_REQUIRED` |
| PATCH | `/api/orders/ID_PEDIDO/status` | `{"status": "on_the_way"}` | 400 `INVALID_ORDER_STATUS` |
| PATCH | `/api/orders/ID_PEDIDO_CREATED/status` | `{"status": "delivered"}` | 409 `INVALID_STATUS_TRANSITION` |
| GET | `/api/mocks/users?qty=muchos` | — | 400 `INVALID_MOCK_AMOUNT` |
| GET | `/api/mocks/users?qty=-5` | — | 400 `INVALID_MOCK_AMOUNT` |
| POST | `/api/mocks/seed` | `{"users": 3, "products": 2, "orders": 2, "deliveries": 5}` | 400 `INVALID_MOCK_AMOUNT` |

JSON mal formado (desde la terminal, porque los clientes HTTP no dejan enviarlo):

```bash
curl -s -X POST http://localhost:3000/api/products -H "Content-Type: application/json" -d '{"name": '
```

Respuesta: 400 `INVALID_JSON`.

## Logging

Logger centralizado con [Winston](https://github.com/winstonjs/winston) y rotación diaria con [`winston-daily-rotate-file`](https://github.com/winstonjs/winston-daily-rotate-file). La configuración vive en un único módulo, `src/config/logger.js`, y el resto del proyecto importa la misma instancia. En `src/` no hay ningún `console.log`.

### Niveles

| Nivel | Prioridad | Uso en ShipNow |
|---|---|---|
| `fatal` | 0 | Fallas críticas: MongoDB no conecta al arrancar, promesas o excepciones sin capturar |
| `error` | 1 | Errores inesperados del servidor (5xx), con el stack |
| `warning` | 2 | Errores esperados (4xx: recurso inexistente, datos inválidos, transición inválida, mocks inválidos, ruta inexistente), pedido sin repartidor, compensaciones |
| `info` | 3 | Arranque, conexión a MongoDB, pedido creado, cambio de estado, repartidor asignado, mocks generados |
| `http` | 4 | Cada petición: método, ruta, status y duración |
| `debug` | 5 | Detalle para desarrollo |

En Winston, **menor número = más importante**, y el nivel mínimo incluye todos los de número menor o igual. Por eso `fatal` es 0. El ejemplo del material del curso numera los niveles al revés (`debug: 0 ... fatal: 5`); con esa tabla, el archivo de errores recibiría todos los niveles salvo `fatal`, y no se cumpliría que `error.log` contenga solo `error` y `fatal`.

### Comportamiento según el entorno

| Entorno | Nivel mínimo | Consola | `error.log` | `combined.log` |
|---|---|---|---|---|
| `development` | `debug` | Sí, con colores | `error` y `fatal` | `info` en adelante |
| `production` | `info` | No | `error` y `fatal` | `info` en adelante |
| `test` | — | No (silencioso) | No | No |

El nivel mínimo se puede cambiar con la variable opcional `LOG_LEVEL`.

Formato de cada línea:

```
2026-10-20 23:55:13 [info] Pedido creado 6ad8... {"customer":"6ace...","items":1,"total":200}
2026-10-20 23:55:13 [warning] Pedido 6ad8... sin repartidor asignado (entrega 6ad8... en pending)
2026-10-20 23:55:14 [warning] ORDER_NOT_FOUND en GET /api/orders/123
```

### Dónde se guardan los logs y rotación

```
logs/
├── 2026-10-20/
│   ├── error.log       ← solo error y fatal
│   └── combined.log    ← info, warning, error y fatal
├── 2026-10-21/
│   └── ...
├── .audit-error.json   ← registro interno de la rotación
└── .audit-combined.json
```

Se crea una carpeta por día y se conservan **14 días** de historial: los archivos más viejos se borran automáticamente, así los logs no crecen sin control.

**La carpeta `logs/` está en `.gitignore`** (junto con `*.log`): los logs son archivos generados por la aplicación y pueden contener información interna, así que nunca se suben al repositorio.

### Integración con el manejo de errores

El middleware global de errores registra cada error antes de responder: los esperados (4xx) como `warning`, con el código, la ruta y el `details`; los inesperados (5xx) como `error`, con el mensaje original y el stack. El logger complementa la respuesta, no la reemplaza: el cliente sigue recibiendo el formato de error de siempre, y el stack nunca viaja en la respuesta.

Una sola falla no pasa por el logger: si falta una variable de entorno, la app se detiene **al cargar la configuración**, antes de que el logger exista (el logger necesita la configuración para saber dónde escribir). Ese error se muestra por la salida estándar con su mensaje descriptivo.

### Probar el logger

`GET /api/loggerTest` genera un log de prueba en cada nivel. **Es una herramienta interna de validación, no una funcionalidad de negocio**, y no se monta en producción (responde 404 con `NODE_ENV=production`).

```bash
curl http://localhost:3000/api/loggerTest
```

Respuesta:

```json
{"status": "success", "payload": {"message": "Logs de prueba generados en todos los niveles", "levels": ["fatal", "error", "warning", "info", "http", "debug"]}}
```

Resultado esperado:

| Destino | Qué aparece |
|---|---|
| Consola (desarrollo) | Los 6 niveles |
| `logs/<fecha>/combined.log` | `fatal`, `error`, `warning` e `info` |
| `logs/<fecha>/error.log` | Solo `fatal` y `error` |


## Testing

### Herramientas

| Herramienta | Para qué |
|---|---|
| [Mocha](https://mochajs.org/) | Organiza y ejecuta los tests (`describe`, `it`, hooks) |
| [Chai](https://www.chaijs.com/) | Aserciones (`expect`) |
| [Supertest](https://github.com/ladjs/supertest) | Peticiones HTTP a la app de Express sin abrir un puerto |
| [mongodb-memory-server](https://github.com/typegoose/mongodb-memory-server) | MongoDB real pero temporal, en memoria, para los tests funcionales |

### Cómo ejecutarlos

```bash
npm test
```

Corre la suite completa (unitaria y funcional) desde cero. La **primera vez** descarga el binario de MongoDB (puede tardar alrededor de un minuto) y queda en caché. Después, la suite tarda unos segundos.

El script `pretest` ejecuta `npm install --include=dev` antes de cada `npm test`, así la suite corre aunque el proyecto se haya instalado con `--omit=dev` o `NODE_ENV=production`.

### Base de datos de testing

**No hace falta crear ni configurar ninguna base de datos.** `tests/setup.js` levanta un MongoDB en memoria antes de la suite (root hooks de Mocha), conecta Mongoose a esa instancia y la apaga al terminar. Cada corrida empieza con una base vacía y descartable, separada de la de desarrollo.

### Variables de entorno

**No se necesita ningún `.env` para correr los tests.** `tests/setup.js` fija `NODE_ENV=test` (y valores de prueba para `PORT` y `MONGODB_URI`) **antes** de que la app lea el `.env`. Como dotenv no pisa variables ya definidas, los tests nunca pueden conectarse a la base de desarrollo. En `test`, el logger es silencioso y no crea archivos.

### Qué cubren

**Tests funcionales** (`tests/functional/`, con Supertest contra la API real):

| Archivo | Módulo | Casos principales |
|---|---|---|
| `users.test.js` | Usuarios | Listado y filtro por rol, alta (rol por defecto, email normalizado, lista blanca), consulta por id, actualización, baja; errores 400, 404 y 409, incluida la concurrencia sobre el email único |
| `products.test.js` | Productos | Listado con y sin stock, alta con estado calculado, consulta, actualización, baja; validaciones y 404 |
| `orders.test.js` | Pedidos | Alta (snapshot, total, estado y prioridad), listado y filtro, consulta por id, todas las transiciones de estado y tracking; datos incompletos, recurso inexistente, estado inválido y transición no permitida |
| `deliveries.test.js` | Entregas | Alta, listado y filtro, consulta, asignación de repartidor (pedido y entrega sincronizados); cada error 400, 404 y 409 |
| `flow.test.js` | Flujo principal | Pedido → entrega → asignar repartidor → `picked_up` → `in_transit` → `delivered`, con el tracking en cada etapa |
| `mocks.test.js` | Mocks | Las 8 rutas de vista previa y sus alias, seed simple y completo (verificando relaciones en la base); cantidades inválidas |
| `logger.test.js` | Logger | `GET /api/loggerTest` |
| `docs.test.js` | Swagger y errores generales | `/api/docs` y `/api/docs.json`, ruta inexistente, JSON mal formado en todos los endpoints con body |
| `uploads.test.js` | Carga de archivos | Documento PDF y licencia PNG (carpeta correcta y archivo en disco), comprobante con el pedido `in_transit` (pasa a `delivered`) y su reemplazo (borra el anterior); sin archivo, formato no permitido, más de 5 MB, campo equivocado, tipo de documento inválido, entidad inexistente, estado no válido y subidas simultáneas, verificando que no queden archivos huérfanos |

**Tests unitarios** (`tests/unit/`, sin base de datos): reglas de negocio de los services con repositories falsos (inyectados por constructor), configuración, constantes, diccionario de errores, middlewares, logger y generadores de mocks.

### Criterios

- **Respuestas exitosas:** cada test verifica el status y además la estructura del body y sus propiedades importantes.
- **Errores:** `expectError()` verifica el status HTTP, `status: "error"`, el código interno y su mensaje exacto, comparándolos con el diccionario de errores.
- **Coherencia con Swagger:** cada respuesta de error documentada en `src/docs/*.yaml` tiene un test que la produce (los 500 no se fuerzan, porque requieren tirar la base).
- **Datos controlados y limpieza:** cada test crea sus propios datos por la API (`tests/functional/helpers.js`) y la base se vacía con `beforeEach(clearDatabase)`. Los tests no dependen del orden ni del estado previo, y la suite pasa dos veces seguidas sin limpiar nada a mano.

## Rendimiento y robustez

| Medida | Qué resuelve |
|---|---|
| **Paginación con tope de 100** | Ningún listado devuelve la colección completa (ver [Paginación](#paginación-de-los-listados)) |
| **Índices de los listados** | Cada listado filtrado tiene un índice compuesto `filtro + createdAt + _id` (por ejemplo `{ status: 1, createdAt: -1, _id: -1 }` en pedidos). MongoDB encuentra la página por el índice, sin recorrer la colección ni ordenar en memoria |
| **Consultas livianas** | `.lean()` devuelve objetos planos (sin la sobrecarga de los documentos de Mongoose), la proyección excluye `__v` y los `populate` traen solo los campos necesarios |
| **Página y total en paralelo** | Cada listado hace la consulta de la página y el `countDocuments` con `Promise.all` |
| **Límite del body JSON (100 KB)** | Un body más grande se corta antes de parsearlo y responde 413 `PAYLOAD_TOO_LARGE` (los archivos tienen su propio límite de 5 MB) |
| **Apagado ordenado** | Con `SIGTERM` (lo manda `docker stop`) o `SIGINT` (Ctrl+C), el servidor deja de aceptar conexiones, termina las requests en curso, cierra MongoDB y recién ahí sale. Si tarda más de 10 segundos, fuerza la salida |

## Notas

- **Stock:** crear un pedido valida que cada producto exista y esté `available`, pero **no descuenta stock**. Es una decisión de diseño: descontarlo correctamente con varios items requiere operaciones atómicas por producto y devolverlo ante cancelaciones o fallas parciales, y ninguna consigna lo pide.
- **Seed de mocks sin transacciones:** si MongoDB falla a mitad de un seed, lo ya insertado en pasos anteriores (por ejemplo, los usuarios) queda guardado. La API responde `MOCK_GENERATION_ERROR` con el motivo en `details`.
- **Asignación de repartidor sin transacciones (compensación):** asignar escribe en dos colecciones. Primero el pedido pasa a `assigned` con una escritura condicional; si después falla la actualización de la entrega, el pedido vuelve a `created` (operación compensatoria). Así ninguna falla deja un pedido `assigned` sin repartidor.
- **Cancelación con entrega pendiente:** cancelar un pedido `created` que ya tiene una entrega `pending` deja esa entrega sin efecto pero guardada. Sincronizar el estado de la entrega con los cambios posteriores del pedido queda fuera del alcance actual.

## Autor

Tomas Beron — [iTzTomitox](https://github.com/iTzTomitox)