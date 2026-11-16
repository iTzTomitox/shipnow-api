// Ejecuta fn y devuelve el error que lanza; si no lanza, el test falla
export const catchError = async (fn) => {
  try {
    await fn()
  } catch (error) {
    return error
  }
  throw new Error('Se esperaba que lanzara un error')
}
