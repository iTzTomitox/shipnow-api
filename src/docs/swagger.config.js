import path from 'node:path'
import { fileURLToPath } from 'node:url'
import swaggerJSDoc from 'swagger-jsdoc'
import config from '../config/index.js'

// Carpeta de este archivo (src/docs): los YAML se buscan acá sin depender
// de desde dónde se arranque Node. glob necesita barras "/" también en Windows.
const docsDir = path.dirname(fileURLToPath(import.meta.url)).replace(/\\/g, '/')

const swaggerOptions = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'ShipNow API',
      version: '1.0.0',
      description:
        'API REST de logística: usuarios, productos, pedidos, entregas con asignación de repartidor ' +
        'y tracking. Incluye herramientas internas de desarrollo (mocks y prueba del logger). ' +
        'Proyecto integrador de Programación Backend III (CoderHouse).'
    },
    servers: [{ url: `http://localhost:${config.port}`, description: 'Servidor local' }],
    // Orden y descripción de los grupos en Swagger UI
    tags: [
      { name: 'Users', description: 'Usuarios con rol admin, user (cliente) o driver (repartidor)' },
      { name: 'Products', description: 'Catálogo; el estado se calcula a partir del stock' },
      { name: 'Orders', description: 'Pedidos, transiciones de estado y tracking' },
      { name: 'Deliveries', description: 'Entregas y asignación de repartidor' },
      { name: 'Mocks', description: 'Herramienta interna: datos simulados (no disponible en producción)' },
      { name: 'Logger', description: 'Herramienta interna: prueba del logger (no disponible en producción)' }
    ]
  },
  apis: [`${docsDir}/*.yaml`]
}

// Herramientas internas: en producción no se montan, así que tampoco se documentan
const INTERNAL_TAGS = ['Mocks', 'Logger']

const buildSpecs = () => {
  const specs = swaggerJSDoc(swaggerOptions)
  if (config.nodeEnv !== 'production') return specs

  for (const [route, item] of Object.entries(specs.paths)) {
    const isInternal = Object.values(item).some((op) => op.tags?.some((tag) => INTERNAL_TAGS.includes(tag)))
    if (isInternal) delete specs.paths[route]
  }
  specs.tags = specs.tags.filter((tag) => !INTERNAL_TAGS.includes(tag.name))
  return specs
}

export const swaggerSpecs = buildSpecs()