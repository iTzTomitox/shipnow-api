# ShipNow API

API REST de logística para gestionar usuarios, productos, pedidos y entregas. Proyecto integrador de **Programación Backend III** (CoderHouse).

**Estado actual:** Pre-entrega 1 — arquitectura por capas y configuración de entorno validada.

## Tecnologías

- Node.js 24 con ES Modules
- Express 5
- MongoDB Atlas + Mongoose 9
- dotenv
- Mocha + Chai (tests)

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

Las tres son obligatorias. La configuración se valida al arrancar (`src/config/buildConfig.js`): si falta alguna o tiene un valor inválido, la app **no arranca** y muestra un error descriptivo. Por ejemplo:

```
Error: Faltan variables de entorno críticas: MONGODB_URI. Revisá tu archivo .env (el modelo está en .env.example)
```

`process.env` se lee **únicamente** en `src/config/env.config.js`; el resto del proyecto importa el objeto de configuración ya validado y congelado.

## Estructura del proyecto

```
src/
├── config/          # buildConfig (validación), env.config (único lector de process.env), db
├── constants/       # roles y estados del dominio (Object.freeze)
├── controllers/     # única puerta de entrada HTTP: req/res y status codes
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

Con esta separación, las reglas de negocio se testean sin MongoDB (36 tests en `tests/unit/`), y cambiar la base de datos solo tocaría la capa de repositories.

## Constantes del dominio

Roles y estados se definen una sola vez en `src/constants/index.js`, congelados con `Object.freeze`. En el código nunca se usan strings sueltos como `'admin'`; se usa `USER_ROLES.ADMIN`. Los modelos toman sus `enum` de estas constantes.

| Constante | Valores |
|---|---|
| `USER_ROLES` | `admin`, `user`, `driver` |
| `PRODUCT_STATUS` | `available`, `out_of_stock` |

`src/utils/constants.js` re-exporta el mismo contenido (la consigna menciona las dos rutas).

## Endpoints

Todas las respuestas exitosas tienen la forma `{ "status": "success", "payload": ... }` y los errores `{ "status": "error", "message": "..." }`.

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

## Tests

```bash
npm test
```

Tests unitarios con Mocha y Chai sobre la validación de configuración, las constantes y las reglas de negocio de los services. Los services se prueban inyectándoles un repository falso, así que **no requieren base de datos ni archivo `.env`**.

## Notas

- Los mensajes de `console` en `src/server.js` son temporales: se reemplazan por un logger con Winston en la pre-entrega 4.
- El manejo de errores actual es básico; se reemplaza por errores personalizados y un middleware centralizado en la pre-entrega 3.

## Autor

Tomas Beron — [iTzTomitox](https://github.com/iTzTomitox)