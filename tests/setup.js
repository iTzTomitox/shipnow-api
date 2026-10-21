// Se ejecuta ANTES de toda la suite (lo carga .mocharc.json).
// Fija el entorno de testing antes de que la app lea el .env:
// dotenv no pisa variables ya definidas, así los tests NUNCA usan la base de desarrollo.
process.env.NODE_ENV = 'test'
process.env.PORT ??= '3001'
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/shipnow_test'