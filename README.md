# ShipNow API

API REST de logística para gestionar usuarios, productos, pedidos y entregas. Proyecto integrador de **Programación Backend III** (CoderHouse).

**Estado actual:** Pre-entrega 5 — documentación interactiva de la API con Swagger/OpenAPI.

## Tecnologías

- Node.js 24 con ES Modules
- Express 5
- MongoDB Atlas + Mongoose 9
- dotenv
- Mocha + Chai (tests)
- Winston + winston-daily-rotate-file (logging)
- Swagger / OpenAPI 3 (swagger-jsdoc + swagger-ui-express)

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

`PORT`, `MONGODB_URI` y `NODE_ENV` son obligatorias; `LOG_LEVEL` es opcional.. La configuración se valida al arrancar (`src/config/buildConfig.js`): si falta alguna o tiene un valor inválido, la app **no arranca** y muestra un error descriptivo. Por ejemplo:

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
├── utils/           # helpers
├── app.js           # arma Express (sin abrir puerto)
└── server.js        # conecta a MongoDB y levanta el servidor
tests/
└── unit/            # tests de services con repositories falsos
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


## Tests

```bash
npm test
```

Tests unitarios con Mocha y Chai sobre la validación de configuración, las constantes y las reglas de negocio de los services. Los services se prueban inyectándoles un repository falso, así que **no requieren base de datos ni archivo `.env`**.

> **Nota:** Mocha y Chai son `devDependencies`. El script `pretest` ejecuta `npm install --include=dev` antes de cada `npm test`, así la suite corre aunque el proyecto se haya instalado con `--omit=dev` o `NODE_ENV=production`.

**Entorno de testing aislado:** `.mocharc.json` carga `tests/setup.js` antes de la suite. Ese archivo fija `NODE_ENV=test` y una URI local de test **antes** de que la app lea el `.env` (dotenv no pisa variables ya definidas), así los tests nunca usan la base de desarrollo. En `test` el logger es silencioso y no crea archivos.

## Notas

- **Stock:** crear un pedido valida que cada producto exista y esté `available`, pero **no descuenta stock**. Es una decisión de diseño: descontarlo correctamente con varios items requiere operaciones atómicas por producto y devolverlo ante cancelaciones o fallas parciales, y ninguna consigna lo pide.
- **Seed de mocks sin transacciones:** si MongoDB falla a mitad de un seed, lo ya insertado en pasos anteriores (por ejemplo, los usuarios) queda guardado. La API responde `MOCK_GENERATION_ERROR` con el motivo en `details`.
- **Asignación de repartidor sin transacciones (compensación):** asignar escribe en dos colecciones. Primero el pedido pasa a `assigned` con una escritura condicional; si después falla la actualización de la entrega, el pedido vuelve a `created` (operación compensatoria). Así ninguna falla deja un pedido `assigned` sin repartidor.
- **Cancelación con entrega pendiente:** cancelar un pedido `created` que ya tiene una entrega `pending` deja esa entrega sin efecto pero guardada. Sincronizar el estado de la entrega con los cambios posteriores del pedido queda fuera del alcance actual.

## Autor

Tomas Beron — [iTzTomitox](https://github.com/iTzTomitox)