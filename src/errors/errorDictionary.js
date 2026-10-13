import { MAX_MOCK_ITEMS } from '../constants/index.js'

// Diccionario único de errores: código → status HTTP + mensaje estable para el cliente.
// El detalle específico de cada caso viaja aparte, en `details`.
export const ERRORS = Object.freeze({
  // Generales
  VALIDATION_ERROR: { statusCode: 400, message: 'Los datos enviados no son válidos' },
  INVALID_JSON: { statusCode: 400, message: 'El cuerpo de la petición no es un JSON válido' },
  DUPLICATE_RESOURCE: { statusCode: 409, message: 'Ya existe un recurso con esos datos' },
  ROUTE_NOT_FOUND: { statusCode: 404, message: 'La ruta solicitada no existe' },

  // Usuarios
  USER_NOT_FOUND: { statusCode: 404, message: 'No se encontró el usuario solicitado' },
  USER_ALREADY_EXISTS: { statusCode: 409, message: 'Ya existe un usuario con ese email' },
  INVALID_USER_ROLE: { statusCode: 400, message: 'El rol indicado no es válido' },

  // Productos
  PRODUCT_NOT_FOUND: { statusCode: 404, message: 'No se encontró el producto solicitado' },
  PRODUCT_NOT_AVAILABLE: { statusCode: 409, message: 'El producto no está disponible' },

  // Pedidos
  ORDER_NOT_FOUND: { statusCode: 404, message: 'No se encontró el pedido solicitado' },
  ORDER_ITEMS_REQUIRED: { statusCode: 400, message: 'El pedido debe incluir al menos un item válido' },
  INVALID_ORDER_STATUS: { statusCode: 400, message: 'El estado indicado no es válido para un pedido' },
  INVALID_STATUS_TRANSITION: {
    statusCode: 409,
    message: 'El pedido no puede pasar a ese estado desde su estado actual'
  },

  // Entregas
  DELIVERY_NOT_FOUND: { statusCode: 404, message: 'No se encontró la entrega solicitada' },

  // Mocks
  INVALID_MOCK_AMOUNT: {
    statusCode: 400,
    message: `La cantidad de registros a generar debe ser un entero entre 0 y ${MAX_MOCK_ITEMS}`
  },
  MOCK_GENERATION_ERROR: { statusCode: 500, message: 'No se pudieron generar los datos de prueba' },

  // Sistema
  DATABASE_ERROR: { statusCode: 500, message: 'Error al acceder a la base de datos' },
  INTERNAL_SERVER_ERROR: { statusCode: 500, message: 'Error interno del servidor' }
})

// Lista de códigos, útil para validar y para documentar (Swagger, PE5)
export const ERROR_CODES = Object.freeze(Object.keys(ERRORS))