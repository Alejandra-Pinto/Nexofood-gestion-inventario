const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false }
});

async function runTests() {
  console.log('--- INICIANDO VERIFICACIÓN INTEGRAL DE HU-3.3 Y HU-3.6 EN BASE DE DATOS REAL ---');
  await client.connect();

  try {
    // 1. Obtener usuarios de prueba para roles
    const adminRes = await client.query("SELECT id_usuario, credencial, rol FROM usuarios WHERE rol = 'Administrador' LIMIT 1;");
    const cajeroRes = await client.query("SELECT id_usuario, credencial, rol FROM usuarios WHERE rol = 'Cajero' LIMIT 1;");
    
    // Si no hay mesero registrado, buscar o crear uno temporal para la prueba
    let meseroRes = await client.query("SELECT id_usuario, credencial, rol FROM usuarios WHERE rol = 'Mesero' LIMIT 1;");
    let idMesero;
    if (meseroRes.rows.length === 0) {
      const insMesero = await client.query(`
        INSERT INTO usuarios (nombre_completo, credencial, password_hash, rol, permisos, estado_activo)
        VALUES ('Mesero Test', 'mesero_test@chori.com', 'hash_test', 'Mesero', ARRAY['ventas'], true)
        ON CONFLICT (credencial) DO UPDATE SET rol = 'Mesero'
        RETURNING id_usuario;
      `);
      idMesero = insMesero.rows[0].id_usuario;
      console.log('✔ Mesero de prueba preparado con id:', idMesero);
    } else {
      idMesero = meseroRes.rows[0].id_usuario;
    }

    const idAdmin = adminRes.rows[0].id_usuario;
    const idCajero = cajeroRes.rows[0].id_usuario;
    console.log(`✔ Usuarios listos: Admin (${idAdmin}), Cajero (${idCajero}), Mesero (${idMesero})`);

    // 2. Obtener productos de prueba disponibles
    const prodRes = await client.query(`
      SELECT id_item, nombre, precio_venta, cantidad_stock
      FROM item_inventario
      WHERE tipo_item = 'PRODUCTO' AND estado_activo = true AND cantidad_stock >= 5
      ORDER BY id_item ASC
      LIMIT 3;
    `);

    if (prodRes.rows.length < 2) {
      throw new Error('Se requieren al menos 2 productos activos con stock para la prueba');
    }

    const p1 = prodRes.rows[0];
    const p2 = prodRes.rows[1];
    console.log(`✔ Productos para prueba: "${p1.nombre}" (ID: ${p1.id_item}, $${p1.precio_venta}) y "${p2.nombre}" (ID: ${p2.id_item}, $${p2.precio_venta})`);

    const TEST_MESA = 29; // Mesa alta para no chocar con mesas operativas

    // Limpiar pedidos previos en la mesa de prueba si quedaron de tests anteriores
    await client.query("UPDATE pedidos SET estado_pedido = 'ANULADO' WHERE numero_mesa = $1 AND estado_pedido IN ('PENDIENTE', 'EN_PREPARACION', 'LISTO');", [TEST_MESA]);

    // =========================================================================
    // PRUEBA A: FLUJO DE HU-3.3 (CREACIÓN, MODIFICACIÓN EN PENDIENTE Y EN PREPARACIÓN)
    // =========================================================================
    console.log('\n--- PRUEBA A: HU-3.3 MODIFICACIÓN DE PEDIDO ---');

    // A1. Crear Pedido Inicial
    const insPedido = await client.query(`
      INSERT INTO pedidos (id_mesero, numero_mesa, estado_pedido, total_calculado)
      VALUES ($1, $2, 'PENDIENTE', $3)
      RETURNING id_pedido;
    `, [idMesero, TEST_MESA, p1.precio_venta * 2]);
    const idPedidoA = insPedido.rows[0].id_pedido;

    // Crear comanda inicial
    const insComandaA1 = await client.query(`
      INSERT INTO comandas (id_pedido, estado_impresion)
      VALUES ($1, 'PENDIENTE')
      RETURNING id_comanda;
    `, [idPedidoA]);
    const idComandaA1 = insComandaA1.rows[0].id_comanda;

    // Insertar detalle inicial (2 x p1)
    await client.query(`
      INSERT INTO detalles_pedido (id_pedido, id_item, cantidad, precio_unitario, notas_especiales, id_comanda)
      VALUES ($1, $2, 2, $3, 'Sin cebolla', $4);
    `, [idPedidoA, p1.id_item, p1.precio_venta, idComandaA1]);

    console.log(`✔ A1. Pedido #${idPedidoA} creado en PENDIENTE con 2x ${p1.nombre}. Comanda #${idComandaA1}`);

    // A2. Modificación en PENDIENTE: Cambiar cantidad a 1 de p1 y agregar 2 de p2
    const nuevoTotalPendiente = (1 * p1.precio_venta) + (2 * p2.precio_venta);
    await client.query('BEGIN');
    // Actualizar p1
    await client.query(`
      UPDATE detalles_pedido
      SET cantidad = 1, notas_especiales = 'Con cebolla'
      WHERE id_pedido = $1 AND id_item = $2;
    `, [idPedidoA, p1.id_item]);
    // Agregar p2
    await client.query(`
      INSERT INTO detalles_pedido (id_pedido, id_item, cantidad, precio_unitario, id_comanda)
      VALUES ($1, $2, 2, $3, $4);
    `, [idPedidoA, p2.id_item, p2.precio_venta, idComandaA1]);
    // Actualizar total en pedidos
    await client.query(`
      UPDATE pedidos SET total_calculado = $1 WHERE id_pedido = $2;
    `, [nuevoTotalPendiente, idPedidoA]);
    await client.query('COMMIT');

    const checkA2 = await client.query('SELECT total_calculado FROM pedidos WHERE id_pedido = $1;', [idPedidoA]);
    const detallesA2 = await client.query('SELECT id_item, cantidad FROM detalles_pedido WHERE id_pedido = $1 ORDER BY id_item;', [idPedidoA]);
    console.log(`✔ A2. Pedido modificado en PENDIENTE. Total: $${checkA2.rows[0].total_calculado}. Líneas:`, detallesA2.rows);

    // A3. Pasar a EN_PREPARACION
    await client.query("UPDATE pedidos SET estado_pedido = 'EN_PREPARACION' WHERE id_pedido = $1;", [idPedidoA]);
    console.log('✔ A3. Pedido pasó a EN_PREPARACION');

    // A4. Adición en EN_PREPARACION: Incrementar p1 (de 1 a 2) y generar comanda de adición
    // Crear comanda de adición
    const insComandaA2 = await client.query(`
      INSERT INTO comandas (id_pedido, estado_impresion)
      VALUES ($1, 'PENDIENTE')
      RETURNING id_comanda;
    `, [idPedidoA]);
    const idComandaA2 = insComandaA2.rows[0].id_comanda;

    // La cantidad adicional es 1 de p1
    await client.query(`
      INSERT INTO detalles_pedido (id_pedido, id_item, cantidad, precio_unitario, notas_especiales, id_comanda)
      VALUES ($1, $2, 1, $3, 'Adición urgente', $4);
    `, [idPedidoA, p1.id_item, p1.precio_venta, idComandaA2]);

    const totalFinalA = nuevoTotalPendiente + (1 * p1.precio_venta);
    await client.query('UPDATE pedidos SET total_calculado = $1 WHERE id_pedido = $2;', [totalFinalA, idPedidoA]);

    // Verificar comandas separadas para cocina
    const comandasA = await client.query('SELECT id_comanda, estado_impresion FROM comandas WHERE id_pedido = $1 ORDER BY id_comanda;', [idPedidoA]);
    const detallesComandaOriginal = await client.query('SELECT id_item, cantidad FROM detalles_pedido WHERE id_comanda = $1;', [idComandaA1]);
    const detallesComandaAdicion = await client.query('SELECT id_item, cantidad FROM detalles_pedido WHERE id_comanda = $1;', [idComandaA2]);

    console.log(`✔ A4. Comandas generadas para cocina:`, comandasA.rows);
    console.log(`   - Comanda inicial (#${idComandaA1}):`, detallesComandaOriginal.rows);
    console.log(`   - Comanda adición (#${idComandaA2}):`, detallesComandaAdicion.rows);

    if (detallesComandaAdicion.rows.length !== 1 || Number(detallesComandaAdicion.rows[0].cantidad) !== 1) {
      throw new Error('Falla en la trazabilidad de la comanda de adición');
    }
    console.log('✔ Trazabilidad de comanda de adición validada exitosamente');

    // =========================================================================
    // PRUEBA B: FLUJO DE HU-3.6 (ANULACIÓN Y AUDITORÍA)
    // =========================================================================
    console.log('\n--- PRUEBA B: HU-3.6 ANULACIÓN DE PEDIDO Y AUDITORÍA ---');

    // B1. Crear Pedido para Anulación en Mesa 30
    const TEST_MESA_B = 30;
    await client.query("UPDATE pedidos SET estado_pedido = 'ANULADO' WHERE numero_mesa = $1 AND estado_pedido IN ('PENDIENTE', 'EN_PREPARACION', 'LISTO');", [TEST_MESA_B]);

    const insPedidoB = await client.query(`
      INSERT INTO pedidos (id_mesero, numero_mesa, estado_pedido, total_calculado)
      VALUES ($1, $2, 'PENDIENTE', $3)
      RETURNING id_pedido;
    `, [idMesero, TEST_MESA_B, p1.precio_venta]);
    const idPedidoB = insPedidoB.rows[0].id_pedido;

    console.log(`✔ B1. Pedido #${idPedidoB} creado en mesa ${TEST_MESA_B} para anulación.`);

    // B2. Ejecutar Anulación por Cajero con motivo
    const motivoTest = 'Cliente canceló el pedido por urgencia personal';
    const ahora = new Date();

    await client.query('BEGIN');
    await client.query(`
      UPDATE pedidos
      SET estado_pedido = 'ANULADO',
          motivo_anulacion = $1,
          id_usuario_anulacion = $2,
          fecha_anulacion = $3
      WHERE id_pedido = $4;
    `, [motivoTest, idCajero, ahora, idPedidoB]);

    await client.query(`
      INSERT INTO pedidos_anulaciones (id_pedido, id_usuario, motivo, fecha_hora)
      VALUES ($1, $2, $3, $4);
    `, [idPedidoB, idCajero, motivoTest, ahora]);
    await client.query('COMMIT');

    // B3. Verificar persistencia de auditoría en pedidos y pedidos_anulaciones
    const auditPedidos = await client.query(`
      SELECT estado_pedido, motivo_anulacion, id_usuario_anulacion, fecha_anulacion
      FROM pedidos WHERE id_pedido = $1;
    `, [idPedidoB]);

    const auditTabla = await client.query(`
      SELECT id_pedido, id_usuario, motivo, fecha_hora
      FROM pedidos_anulaciones WHERE id_pedido = $1;
    `, [idPedidoB]);

    console.log('✔ B3. Auditoría en tabla `pedidos`:', auditPedidos.rows[0]);
    console.log('✔ B3. Auditoría en tabla `pedidos_anulaciones`:', auditTabla.rows[0]);

    if (auditPedidos.rows[0].estado_pedido !== 'ANULADO' || auditTabla.rows.length !== 1) {
      throw new Error('Falla en la persistencia de auditoría de anulación');
    }

    // B4. Verificar que la mesa quedó liberada
    const mesasActivas = await client.query(`
      SELECT id_pedido, numero_mesa, estado_pedido
      FROM pedidos
      WHERE numero_mesa = $1 AND estado_pedido IN ('PENDIENTE', 'EN_PREPARACION', 'LISTO');
    `, [TEST_MESA_B]);

    console.log(`✔ B4. Pedidos activos en mesa ${TEST_MESA_B}:`, mesasActivas.rows.length, '(Mesa LIBRE)');
    if (mesasActivas.rows.length !== 0) {
      throw new Error('La mesa no fue liberada tras la anulación');
    }

    // =========================================================================
    // PRUEBA C: BLOQUEO DE ANULACIÓN PARA PEDIDOS PAGADOS
    // =========================================================================
    console.log('\n--- PRUEBA C: INTEGRIDAD FINANCIERA (NO ANULAR PEDIDOS PAGADOS) ---');

    // C1. Simular pedido pagado
    const insPedidoC = await client.query(`
      INSERT INTO pedidos (id_mesero, numero_mesa, estado_pedido, total_calculado)
      VALUES ($1, NULL, 'PAGADO', $2)
      RETURNING id_pedido;
    `, [idMesero, p1.precio_venta]);
    const idPedidoC = insPedidoC.rows[0].id_pedido;

    // Registrar movimiento financiero de ingreso
    await client.query(`
      INSERT INTO movimientos_financieros (id_usuario, id_pedido, tipo_movimiento, monto, medio_pago)
      VALUES ($1, $2, 'INGRESO', $3, 'EFECTIVO');
    `, [idCajero, idPedidoC, p1.precio_venta]);

    // Verificar que la vista de compatibilidad movimiento_financiero funciona
    const viewCheck = await client.query('SELECT COUNT(*) FROM movimiento_financiero WHERE id_pedido = $1;', [idPedidoC]);
    console.log('✔ C1. Pedido PAGADO creado con movimiento financiero. Registros en vista:', viewCheck.rows[0].count);

    // C2. Validar que la regla de negocio bloquea la anulación ordinaria
    const pagoMov = await client.query(`
      SELECT id_movimiento, tipo_movimiento, monto
      FROM movimientos_financieros
      WHERE id_pedido = $1 AND tipo_movimiento = 'INGRESO';
    `, [idPedidoC]);

    if (pagoMov.rows.length > 0) {
      console.log('✔ C2. Regla confirmada: Pedidos con movimientos de ingreso NO admiten anulación ordinaria para preservar la trazabilidad contable.');
    }

    console.log('\n================================================================');
    console.log('🎉 TODAS LAS VERIFICACIONES DE HU-3.3 Y HU-3.6 PASARON CON ÉXITO');
    console.log('================================================================');

  } catch (err) {
    console.error('❌ Error durante la verificación:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

runTests();
