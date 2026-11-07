import { expect } from 'chai'
import { api, clearDatabase, expectError, createUser, createDriver, createProduct } from './helpers.js'

// Flujo principal de un envío, de punta a punta, tal como lo usaría un cliente real:
// crear pedido → crear entrega → asignar repartidor → retirar → en camino → entregado
describe('Funcional: flujo principal de un envío', () => {
  before(clearDatabase)
  after(clearDatabase)

  it('recorre el ciclo completo y el tracking refleja cada etapa', async () => {
    const customer = await createUser({ firstName: 'Camila' })
    const driver = await createDriver({ firstName: 'José' })
    const product = await createProduct({ name: 'Paquete mediano', price: 1500, stock: 3 })

    // 1) Crear el pedido
    const created = await api()
      .post('/api/orders')
      .send({ customer: customer._id, items: [{ product: product._id, quantity: 2 }], deliveryAddress: 'Calle Flujo 1' })
    expect(created.status).to.equal(201)
    const order = created.body.payload
    expect(order).to.include({ status: 'created', total: 3000 })

    let tracking = await api().get(`/api/orders/${order._id}/tracking`)
    expect(tracking.body.payload.delivery).to.equal(null)

    // 2) Crear la entrega
    const deliveryRes = await api().post('/api/deliveries').send({ order: order._id })
    expect(deliveryRes.status).to.equal(201)
    const delivery = deliveryRes.body.payload

    // 3) Asignar repartidor: entrega y pedido pasan a assigned
    const assigned = await api().patch(`/api/deliveries/${delivery._id}/assign`).send({ driver: driver._id })
    expect(assigned.status).to.equal(200)

    tracking = await api().get(`/api/orders/${order._id}/tracking`)
    expect(tracking.body.payload.order.status).to.equal('assigned')
    expect(tracking.body.payload.delivery.status).to.equal('assigned')
    expect(tracking.body.payload.delivery.driver).to.include({ _id: driver._id, firstName: 'José' })

    // 4) Avanzar el pedido por sus estados
    for (const status of ['picked_up', 'in_transit', 'delivered']) {
      const res = await api().patch(`/api/orders/${order._id}/status`).send({ status })
      expect(res.status, `pasar a ${status}`).to.equal(200)
      expect(res.body.payload.status).to.equal(status)
    }

    tracking = await api().get(`/api/orders/${order._id}/tracking`)
    expect(tracking.body.payload.order.status).to.equal('delivered')

    // 5) Un pedido entregado es final: no se puede cancelar
    const cancel = await api().patch(`/api/orders/${order._id}/status`).send({ status: 'cancelled' })
    expectError(cancel, 'INVALID_STATUS_TRANSITION')
  })
})
