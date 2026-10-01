-- ============================================================================
-- PROYECTO UNIVERSITARIO: NEXOFOOD
-- SISTEMA DE GESTIÓN DE INVENTARIO, COMPRAS, PRODUCCIÓN Y PEDIDOS
-- ESQUEMA SQL DEFINITIVO AUDITADO PARA POSTGRESQL / SUPABASE (VERSIÓN FINAL)
-- ============================================================================
-- Stack: PostgreSQL 14+ / Supabase
-- Backend: NestJS con TypeORM
-- Frontend: Angular
-- Autenticación: Supabase Auth (auth.users)
-- ============================================================================

-- ============================================================================
-- SECCIÓN 0: EXTENSIONES REQUERIDAS
-- ============================================================================
-- En PostgreSQL 13+, gen_random_uuid() está integrado de forma nativa en el core.
-- Se mantiene pgcrypto para soporte criptográfico auxiliar si fuese requerido.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- SECCIÓN 1: MÓDULO DE USUARIOS, ROLES Y SEGURIDAD (RBAC)
-- ============================================================================

-- 1.1 Tabla: roles
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_roles_name UNIQUE (name)
);

COMMENT ON TABLE public.roles IS 'Catálogo de roles del sistema (ADMIN, GERENTE, EMPLEADO)';

-- 1.2 Tabla: permissions
CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    module VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_permissions_name UNIQUE (name)
);

COMMENT ON TABLE public.permissions IS 'Permisos granulares del sistema organizados por módulo funcional';

-- 1.3 Tabla: role_permissions (Relación M:N entre roles y permisos)
CREATE TABLE IF NOT EXISTS public.role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_role_permission UNIQUE (role_id, permission_id)
);

COMMENT ON TABLE public.role_permissions IS 'Matriz de asignación de permisos a roles';

-- 1.4 Tabla: profiles
-- Vinculada 1:1 con auth.users administrada por Supabase Auth.
-- IMPORTANTE: "Eliminar usuario" corresponde a desactivación lógica (is_active = false)
-- para preservar la integridad de auditoría, compras, ventas y movimientos históricos.
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
    full_name VARCHAR(150),
    phone VARCHAR(30),
    role_id UUID REFERENCES public.roles(id) ON DELETE RESTRICT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS 'Perfil público vinculado a auth.users.id. Desactivación lógica mediante is_active = false';

-- 1.5 Tabla: user_permissions
-- Permisos excepcionales a nivel de usuario individual.
-- granted = true: Agrega un permiso que su rol no tiene.
-- granted = false: Revoca/bloquea explícitamente un permiso heredado del rol.
CREATE TABLE IF NOT EXISTS public.user_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    granted BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_permission UNIQUE (user_id, permission_id)
);

COMMENT ON TABLE public.user_permissions IS 'Sobrescritura individual de permisos. granted=false revoca permisos del rol';

-- ============================================================================
-- SECCIÓN 2: MÓDULO DE INVENTARIO (PRODUCTOS E INSUMOS)
-- ============================================================================

-- 2.1 Tabla: inventory_items
CREATE TABLE IF NOT EXISTS public.inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    item_type VARCHAR(20) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    cost NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    sale_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    current_stock NUMERIC(12,3) NOT NULL DEFAULT 0.000,
    minimum_stock NUMERIC(12,3) NOT NULL DEFAULT 0.000,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Restricciones de dominio y validación
    CONSTRAINT uq_inventory_items_code UNIQUE (code),
    CONSTRAINT chk_inventory_item_type CHECK (item_type IN ('PRODUCT', 'SUPPLY')),
    CONSTRAINT chk_inventory_cost_positive CHECK (cost >= 0),
    CONSTRAINT chk_inventory_sale_price_positive CHECK (sale_price >= 0),
    CONSTRAINT chk_inventory_current_stock_positive CHECK (current_stock >= 0),
    CONSTRAINT chk_inventory_minimum_stock_positive CHECK (minimum_stock >= 0)
);

COMMENT ON TABLE public.inventory_items IS 'Catálogo maestro de insumos (SUPPLY) y productos finales elaborados (PRODUCT)';
COMMENT ON COLUMN public.inventory_items.cost IS 'Costo confidencial protegido a nivel de privilegios de columna y enmascarado en vistas';
COMMENT ON COLUMN public.inventory_items.current_stock IS 'Stock actual protegido contra UPDATE directo. Solo modificable vía Kardex transaccional';

-- ============================================================================
-- SECCIÓN 3: MÓDULO DE PROVEEDORES
-- ============================================================================

-- 3.1 Tabla: suppliers
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    identification VARCHAR(50),
    phone VARCHAR(30),
    email VARCHAR(100),
    address TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.suppliers IS 'Catálogo de proveedores de insumos y materias primas';

-- ============================================================================
-- SECCIÓN 4: MÓDULO DE COMPRAS (ÓRDENES DE COMPRA)
-- ============================================================================

-- 4.1 Tabla: purchase_orders
CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    purchase_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_purchase_orders_status CHECK (status IN ('PENDING', 'RECEIVED', 'CANCELLED')),
    CONSTRAINT chk_purchase_orders_total CHECK (total >= 0)
);

COMMENT ON TABLE public.purchase_orders IS 'Cabeceras de compras a proveedores. Total sincronizado por trigger';

-- 4.2 Tabla: purchase_order_items
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
    quantity NUMERIC(12,3) NOT NULL,
    unit_cost NUMERIC(12,2) NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL,
    CONSTRAINT chk_poi_quantity CHECK (quantity > 0),
    CONSTRAINT chk_poi_unit_cost CHECK (unit_cost >= 0),
    CONSTRAINT chk_poi_subtotal CHECK (subtotal >= 0)
);

COMMENT ON TABLE public.purchase_order_items IS 'Detalle de compras. Subtotal calculado y protegido por trigger';

-- ============================================================================
-- SECCIÓN 5: MÓDULO DE PRODUCCIÓN (RECETAS Y REGISTROS)
-- ============================================================================

-- 5.1 Tabla: recipes
CREATE TABLE IF NOT EXISTS public.recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    yield_quantity NUMERIC(12,3) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_recipes_yield CHECK (yield_quantity > 0)
);

COMMENT ON TABLE public.recipes IS 'Fórmulas maestras. El producto asociado debe ser de tipo PRODUCT';

-- 5.2 Tabla: recipe_items
CREATE TABLE IF NOT EXISTS public.recipe_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
    supply_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
    quantity NUMERIC(12,3) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_recipe_supply UNIQUE (recipe_id, supply_id),
    CONSTRAINT chk_recipe_items_qty CHECK (quantity > 0)
);

COMMENT ON TABLE public.recipe_items IS 'Insumos de recetas. El ítem referenciado debe ser de tipo SUPPLY';

-- 5.3 Tabla: production_records
CREATE TABLE IF NOT EXISTS public.production_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE RESTRICT,
    quantity_produced NUMERIC(12,3) NOT NULL,
    production_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_production_qty CHECK (quantity_produced > 0)
);

COMMENT ON TABLE public.production_records IS 'Histórico inmutable de lotes de producción elaborados';

-- ============================================================================
-- SECCIÓN 6: MÓDULO DE CLIENTES
-- ============================================================================

-- 6.1 Tabla: customers
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    identification VARCHAR(50),
    phone VARCHAR(30),
    email VARCHAR(100),
    address TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.customers IS 'Directorio de clientes para pedidos y despachos';

-- ============================================================================
-- SECCIÓN 7: MÓDULO DE PEDIDOS (VENTAS)
-- ============================================================================

-- 7.1 Tabla: orders
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    order_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_orders_status CHECK (status IN ('PENDING', 'CONFIRMED', 'IN_PREPARATION', 'READY', 'DELIVERED', 'CANCELLED')),
    CONSTRAINT chk_orders_total CHECK (total >= 0)
);

COMMENT ON TABLE public.orders IS 'Cabecera de pedidos. Total sincronizado automáticamente por trigger';

-- 7.2 Tabla: order_items
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
    quantity NUMERIC(12,3) NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL,
    CONSTRAINT chk_order_items_qty CHECK (quantity > 0),
    CONSTRAINT chk_order_items_price CHECK (unit_price >= 0),
    CONSTRAINT chk_order_items_subtotal CHECK (subtotal >= 0)
);

COMMENT ON TABLE public.order_items IS 'Líneas de detalle de pedidos. Subtotal calculado automáticamente';

-- ============================================================================
-- SECCIÓN 8: MÓDULO DE MOVIMIENTOS DE INVENTARIO (KARDEX INMUTABLE)
-- ============================================================================

-- 8.1 Tabla: inventory_movements
CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
    movement_type VARCHAR(30) NOT NULL,
    quantity NUMERIC(12,3) NOT NULL,
    previous_stock NUMERIC(12,3) NOT NULL,
    new_stock NUMERIC(12,3) NOT NULL,
    reason TEXT,
    movement_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_mov_type CHECK (movement_type IN (
        'PURCHASE',             -- Entrada por compra recibida (+)
        'PRODUCTION',           -- Entrada de producto terminado por producción (+)
        'MANUAL_OUT',           -- Salida manual controlada (-)
        'WASTE',                -- Merma o desperdicio (-)
        'INTERNAL_CONSUMPTION', -- Consumo de insumo en cocina/producción (-)
        'ADJUSTMENT'            -- Ajuste por inventario físico (+/-)
    )),
    CONSTRAINT chk_mov_quantity_positive CHECK (quantity >= 0),
    CONSTRAINT chk_mov_previous_stock CHECK (previous_stock >= 0),
    CONSTRAINT chk_mov_new_stock CHECK (new_stock >= 0)
);

COMMENT ON TABLE public.inventory_movements IS 'Kardex inmutable. previous_stock y new_stock calculados atómicamente en BD';

-- ============================================================================
-- SECCIÓN 9: MÓDULO DE ALERTAS DE INVENTARIO
-- ============================================================================

-- 9.1 Tabla: inventory_alerts
CREATE TABLE IF NOT EXISTS public.inventory_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
    alert_type VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    CONSTRAINT chk_alert_type CHECK (alert_type IN ('LOW_STOCK', 'OUT_OF_STOCK')),
    CONSTRAINT chk_alert_status CHECK (status IN ('ACTIVE', 'RESOLVED'))
);

COMMENT ON TABLE public.inventory_alerts IS 'Alertas de stock administradas de forma reactiva por triggers de BD';

-- ============================================================================
-- SECCIÓN 10: MÓDULO DE AUDITORÍA Y TRAZABILIDAD
-- ============================================================================

-- 10.1 Tabla: audit_logs
-- Inserción directa denegada a usuarios normales vía RLS.
-- Solo insertable mediante la función controlada log_audit_event() o backend NestJS.
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    entity VARCHAR(50) NOT NULL,
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.audit_logs IS 'Bitácora central de auditoría. Inserción directa protegida';

-- ============================================================================
-- SECCIÓN 11: ÍNDICES DE RENDIMIENTO (SIN ÍNDICES REDUNDANTES)
-- ============================================================================

-- Índices sobre claves foráneas no cubiertas por restricciones UNIQUE
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON public.role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON public.profiles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_permission_id ON public.user_permissions(permission_id);

-- Índices de inventario (code ya posee índice único automático)
CREATE INDEX IF NOT EXISTS idx_inventory_items_name ON public.inventory_items(name);
CREATE INDEX IF NOT EXISTS idx_inventory_items_item_type ON public.inventory_items(item_type);
CREATE INDEX IF NOT EXISTS idx_inventory_items_current_stock ON public.inventory_items(current_stock);
CREATE INDEX IF NOT EXISTS idx_inventory_items_is_active ON public.inventory_items(is_active);

-- Índices de movimientos de inventario
CREATE INDEX IF NOT EXISTS idx_inventory_movements_item_id ON public.inventory_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_movement_date ON public.inventory_movements(movement_date);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_by ON public.inventory_movements(created_by);

-- Índices de compras
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id ON public.purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_purchase_date ON public.purchase_orders(purchase_date);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_by ON public.purchase_orders(created_by);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po_id ON public.purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_item_id ON public.purchase_order_items(item_id);

-- Índices de recetas y producción (recipe_items(recipe_id) cubierto por uq_recipe_supply)
CREATE INDEX IF NOT EXISTS idx_recipes_product_id ON public.recipes(product_id);
CREATE INDEX IF NOT EXISTS idx_recipe_items_supply_id ON public.recipe_items(supply_id);
CREATE INDEX IF NOT EXISTS idx_production_records_recipe_id ON public.production_records(recipe_id);
CREATE INDEX IF NOT EXISTS idx_production_records_date ON public.production_records(production_date);
CREATE INDEX IF NOT EXISTS idx_production_records_created_by ON public.production_records(created_by);

-- Índices de clientes y pedidos
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON public.orders(order_date);
CREATE INDEX IF NOT EXISTS idx_orders_created_by ON public.orders(created_by);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items(product_id);

-- Índices de alertas
CREATE INDEX IF NOT EXISTS idx_inventory_alerts_item_id ON public.inventory_alerts(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_alerts_status ON public.inventory_alerts(status);

-- Índices de auditoría
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

-- ============================================================================
-- SECCIÓN 12: FUNCIONES Y PROCEDIMIENTOS (INTEGRIDAD, IDENTIDAD Y HARDENING)
-- ============================================================================

-- 12.1 Actualización automática de updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 12.2 Funciones auxiliares internas de seguridad (RBAC con jerarquía y revocación individual)
-- FUNCIÓN INTERNA: No expuesta a authenticated, anon ni PUBLIC.
CREATE OR REPLACE FUNCTION public.has_permission(p_user_id UUID, p_permission_name VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
    v_is_active BOOLEAN;
    v_role_name VARCHAR;
    v_user_perm_granted BOOLEAN;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- 1. Validar que el usuario exista y esté activo
    SELECT pr.is_active, r.name 
    INTO v_is_active, v_role_name
    FROM public.profiles pr
    LEFT JOIN public.roles r ON r.id = pr.role_id
    WHERE pr.id = p_user_id;

    IF NOT FOUND OR v_is_active IS NOT TRUE THEN
        RETURN FALSE;
    END IF;

    -- 2. El rol ADMIN posee acceso irrestricto total
    IF v_role_name = 'ADMIN' THEN
        RETURN TRUE;
    END IF;

    -- 3. Revisión de permisos individuales (user_permissions)
    -- granted = true: concede el permiso explícitamente (aditivo)
    -- granted = false: revoca y bloquea el permiso heredado del rol
    SELECT up.granted INTO v_user_perm_granted
    FROM public.user_permissions up
    JOIN public.permissions p ON p.id = up.permission_id
    WHERE up.user_id = p_user_id AND p.name = p_permission_name;

    IF FOUND THEN
        RETURN v_user_perm_granted;
    END IF;

    -- 4. Si no hay regla individual, hereda del rol
    IF EXISTS (
        SELECT 1 
        FROM public.profiles pr
        JOIN public.role_permissions rp ON rp.role_id = pr.role_id
        JOIN public.permissions p ON p.id = rp.permission_id
        WHERE pr.id = p_user_id AND p.name = p_permission_name
    ) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- FUNCIÓN INTERNA: No expuesta a authenticated, anon ni PUBLIC.
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    IF p_user_id IS NULL THEN
        RETURN FALSE;
    END IF;
    RETURN EXISTS (
        SELECT 1 
        FROM public.profiles pr
        JOIN public.roles r ON r.id = pr.role_id
        WHERE pr.id = p_user_id AND r.name = 'ADMIN' AND pr.is_active = TRUE
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- 12.3 Función canónica interna para resolución segura de identidad
-- FUNCIÓN INTERNA: No expuesta a authenticated, anon ni PUBLIC.
-- DOCUMENTACIÓN DE LA ESTRATEGIA DE AUTENTICACIÓN / AUTORIZACIÓN:
-- Flujo previsto:
-- Angular → Supabase Auth (Login) → Emisión de JWT → Petición HTTP a NestJS con Bearer Token
-- → AuthGuard de NestJS valida criptográficamente el JWT y extrae sub (user.id)
-- → NestJS ejecuta la transacción en PostgreSQL enviando p_user_id = user.id verificado.
-- 
-- Reglas de protección en PostgreSQL:
-- 1. Si la petición proviene con JWT de Supabase (PostgREST): auth.uid() está presente.
--    Cualquier p_user_id diferente a auth.uid() es rechazado como intento de suplantación.
-- 2. Si la petición proviene de NestJS vía conexión directa (pool TypeORM): auth.uid() es NULL.
--    Se acepta p_user_id provisto por NestJS tras validar que existe y está activo.
--    El frontend NUNCA debe poder enviar un p_user_id arbitrario sin pasar por la validación de NestJS.
CREATE OR REPLACE FUNCTION public.resolve_authenticated_user(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
    v_auth_uid UUID;
    v_resolved_id UUID;
BEGIN
    v_auth_uid := auth.uid();

    -- Caso A: Llamada desde cliente Supabase con token JWT (PostgREST)
    IF v_auth_uid IS NOT NULL THEN
        IF p_user_id IS NOT NULL AND p_user_id <> v_auth_uid THEN
            RAISE EXCEPTION 'Intento de suplantación detectado: el usuario autenticado (%) no coincide con el parámetro enviado (%)',
                v_auth_uid, p_user_id;
        END IF;
        v_resolved_id := v_auth_uid;

    -- Caso B: Llamada desde backend NestJS vía conexión directa (TypeORM pool)
    ELSE
        IF p_user_id IS NULL THEN
            RAISE EXCEPTION 'Identidad no suministrada: auth.uid() es nulo y no se proporcionó p_user_id.';
        END IF;
        v_resolved_id := p_user_id;
    END IF;

    -- Validar existencia y estado activo en la tabla profiles
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_resolved_id AND is_active = TRUE) THEN
        RAISE EXCEPTION 'El usuario % no existe o se encuentra inactivo.', v_resolved_id;
    END IF;

    RETURN v_resolved_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- 12.4 Trigger: Creación de perfil al registrarse en auth.users (sin silenciar errores)
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
    v_default_role_id UUID;
    v_full_name VARCHAR;
    v_phone VARCHAR;
BEGIN
    SELECT id INTO v_default_role_id FROM public.roles WHERE name = 'EMPLEADO' LIMIT 1;
    
    IF v_default_role_id IS NULL THEN
        RAISE EXCEPTION 'No se encontró el rol por defecto EMPLEADO en la base de datos.';
    END IF;

    v_full_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        split_part(NEW.email, '@', 1)
    );
    v_phone := NEW.raw_user_meta_data->>'phone';

    -- Si falla la inserción, el error se propaga para evitar dejar usuarios en auth.users sin perfil
    INSERT INTO public.profiles (id, full_name, phone, role_id, is_active, created_at, updated_at)
    VALUES (
        NEW.id,
        v_full_name,
        v_phone,
        v_default_role_id,
        TRUE,
        NOW(),
        NOW()
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 12.5 Protección contra escalamiento de privilegios en profiles
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.role_id IS DISTINCT FROM OLD.role_id) OR (NEW.is_active IS DISTINCT FROM OLD.is_active) THEN
        IF auth.uid() IS NOT NULL AND NOT public.has_permission(auth.uid(), 'users.manage') THEN
            RAISE EXCEPTION 'Operación denegada: Solo administradores con el permiso users.manage pueden modificar el rol o estado de un perfil.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 12.6 Protección de integridad de created_by en inserciones
-- Evita que Angular o clientes externos falsifiquen el autor del registro
CREATE OR REPLACE FUNCTION public.enforce_created_by()
RETURNS TRIGGER AS $$
DECLARE
    v_auth_uid UUID;
BEGIN
    v_auth_uid := auth.uid();

    -- Si la petición proviene de Supabase Auth / PostgREST:
    IF v_auth_uid IS NOT NULL THEN
        -- Se fuerza de forma inapelable la identidad del token JWT
        NEW.created_by := v_auth_uid;
    ELSE
        -- Si proviene de NestJS (conexión pool):
        IF NEW.created_by IS NULL THEN
            RAISE EXCEPTION 'El campo created_by es obligatorio para garantizar la trazabilidad del registro.';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.created_by AND is_active = TRUE) THEN
            RAISE EXCEPTION 'El usuario asignado en created_by (%) no existe o se encuentra inactivo.', NEW.created_by;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 12.7 Control estricto de stock inicial en creación de ítems
-- Impide que se creen nuevos ítems con stock inicial arbitrario mayor a cero
CREATE OR REPLACE FUNCTION public.enforce_zero_initial_stock()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.current_stock IS NOT NULL AND NEW.current_stock <> 0.000 THEN
        RAISE EXCEPTION 'Operación denegada: todo nuevo ítem de inventario debe registrarse con stock inicial en 0. Para ingresar stock inicial, utilice el flujo controlado de movimientos (register_inventory_movement).';
    END IF;
    NEW.current_stock := 0.000;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 12.8 Protección de current_stock contra UPDATE directo (Sin dependencia de GUCs)
-- Garantiza que current_stock solo cambie a través de transacciones anidadas del motor de Kardex
CREATE OR REPLACE FUNCTION public.prevent_direct_stock_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Si el stock está siendo modificado
    IF NEW.current_stock IS DISTINCT FROM OLD.current_stock THEN
        -- pg_trigger_depth() mide el nivel de anidamiento de triggers en el motor C de PostgreSQL.
        -- Un UPDATE directo lanzado por cualquier cliente o query tiene pg_trigger_depth() = 1.
        -- La actualización legítima de stock proviene de la ejecución en cascada del Kardex:
        --   register_inventory_movement() -> INSERT inventory_movements 
        --   -> trg_process_inventory_movement (depth 1) 
        --   -> UPDATE inventory_items.current_stock (depth >= 2).
        IF pg_trigger_depth() < 2 THEN
            RAISE EXCEPTION 'Operación denegada: current_stock no puede modificarse directamente. El stock debe actualizarse exclusivamente mediante el flujo controlado de Kardex (register_inventory_movement).';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 12.9 Protección de consistencia de item_type (Integridad referencial en recetas)
-- Impide que un PRODUCT usado en recetas pase a SUPPLY o que un SUPPLY usado pase a PRODUCT
CREATE OR REPLACE FUNCTION public.protect_inventory_item_type()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.item_type IS DISTINCT FROM OLD.item_type THEN
        -- 1. Si era PRODUCT y cambia a otro tipo, verificar que no esté como producto en recetas
        IF OLD.item_type = 'PRODUCT' THEN
            IF EXISTS (SELECT 1 FROM public.recipes WHERE product_id = OLD.id) THEN
                RAISE EXCEPTION 'Operación denegada: no se puede cambiar el tipo del ítem [%] "%" de PRODUCT a % porque está asignado como producto elaborado en recetas existentes.',
                    OLD.code, OLD.name, NEW.item_type;
            END IF;
        END IF;

        -- 2. Si era SUPPLY y cambia a otro tipo, verificar que no esté como insumo en recipe_items
        IF OLD.item_type = 'SUPPLY' THEN
            IF EXISTS (SELECT 1 FROM public.recipe_items WHERE supply_id = OLD.id) THEN
                RAISE EXCEPTION 'Operación denegada: no se puede cambiar el tipo del ítem [%] "%" de SUPPLY a % porque está registrado como insumo/ingrediente en recetas existentes.',
                    OLD.code, OLD.name, NEW.item_type;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 12.10 Protección estricta de asignación y modificación de costo confidencial
-- Exige simultáneamente los permisos inventory.cost.view e inventory.manage para modificar costo
CREATE OR REPLACE FUNCTION public.protect_inventory_cost()
RETURNS TRIGGER AS $$
BEGIN
    -- En UPDATE: si se intenta cambiar el costo
    IF TG_OP = 'UPDATE' THEN
        IF NEW.cost IS DISTINCT FROM OLD.cost THEN
            IF auth.uid() IS NOT NULL THEN
                IF NOT (
                    (public.has_permission(auth.uid(), 'inventory.cost.view') AND public.has_permission(auth.uid(), 'inventory.manage'))
                    OR public.has_permission(auth.uid(), 'purchases.manage')
                    OR public.is_admin(auth.uid())
                ) THEN
                    RAISE EXCEPTION 'Permiso denegado: se requieren simultáneamente los permisos inventory.cost.view e inventory.manage para modificar el costo de un ítem.';
                END IF;
            END IF;
        END IF;
    END IF;

    -- En INSERT: si se intenta asignar un costo inicial distinto de 0
    IF TG_OP = 'INSERT' THEN
        IF NEW.cost IS NOT NULL AND NEW.cost <> 0.00 THEN
            IF auth.uid() IS NOT NULL THEN
                IF NOT (
                    (public.has_permission(auth.uid(), 'inventory.cost.view') AND public.has_permission(auth.uid(), 'inventory.manage'))
                    OR public.is_admin(auth.uid())
                ) THEN
                    RAISE EXCEPTION 'Permiso denegado: se requieren simultáneamente los permisos inventory.cost.view e inventory.manage para asignar costo a un ítem de inventario.';
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;


-- 12.11 Validación de tipo en recetas (Dominio estricto)
CREATE OR REPLACE FUNCTION public.validate_recipe_product()
RETURNS TRIGGER AS $$
DECLARE
    v_type VARCHAR;
BEGIN
    SELECT item_type INTO v_type FROM public.inventory_items WHERE id = NEW.product_id;
    IF v_type <> 'PRODUCT' THEN
        RAISE EXCEPTION 'El producto referenciado en la receta debe ser de tipo PRODUCT (Tipo actual: %)', v_type;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.validate_recipe_supply()
RETURNS TRIGGER AS $$
DECLARE
    v_type VARCHAR;
BEGIN
    SELECT item_type INTO v_type FROM public.inventory_items WHERE id = NEW.supply_id;
    IF v_type <> 'SUPPLY' THEN
        RAISE EXCEPTION 'El ingrediente asignado a la receta debe ser de tipo SUPPLY (Tipo actual: %)', v_type;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 12.13 Triggers de subtotales y sincronización robusta de totales
CREATE OR REPLACE FUNCTION public.calculate_po_item_subtotal()
RETURNS TRIGGER AS $$
BEGIN
    NEW.subtotal := ROUND(NEW.quantity * NEW.unit_cost, 2);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Sincroniza totales de purchase_orders protegiendo contra cambios de padre (reparenting)
CREATE OR REPLACE FUNCTION public.sync_po_total()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.purchase_orders
        SET total = COALESCE((SELECT SUM(subtotal) FROM public.purchase_order_items WHERE purchase_order_id = NEW.purchase_order_id), 0.00),
            updated_at = NOW()
        WHERE id = NEW.purchase_order_id;

    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.purchase_orders
        SET total = COALESCE((SELECT SUM(subtotal) FROM public.purchase_order_items WHERE purchase_order_id = OLD.purchase_order_id), 0.00),
            updated_at = NOW()
        WHERE id = OLD.purchase_order_id;

    ELSIF TG_OP = 'UPDATE' THEN
        -- Si el padre no cambia: recalcular el padre actual
        IF NEW.purchase_order_id = OLD.purchase_order_id THEN
            UPDATE public.purchase_orders
            SET total = COALESCE((SELECT SUM(subtotal) FROM public.purchase_order_items WHERE purchase_order_id = NEW.purchase_order_id), 0.00),
                updated_at = NOW()
            WHERE id = NEW.purchase_order_id;
        ELSE
            -- Si cambia el padre: recalcular tanto el padre anterior como el nuevo
            UPDATE public.purchase_orders
            SET total = COALESCE((SELECT SUM(subtotal) FROM public.purchase_order_items WHERE purchase_order_id = OLD.purchase_order_id), 0.00),
                updated_at = NOW()
            WHERE id = OLD.purchase_order_id;

            UPDATE public.purchase_orders
            SET total = COALESCE((SELECT SUM(subtotal) FROM public.purchase_order_items WHERE purchase_order_id = NEW.purchase_order_id), 0.00),
                updated_at = NOW()
            WHERE id = NEW.purchase_order_id;
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.calculate_order_item_subtotal()
RETURNS TRIGGER AS $$
BEGIN
    NEW.subtotal := ROUND(NEW.quantity * NEW.unit_price, 2);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Sincroniza totales de orders protegiendo contra cambios de padre (reparenting)
CREATE OR REPLACE FUNCTION public.sync_order_total()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.orders
        SET total = COALESCE((SELECT SUM(subtotal) FROM public.order_items WHERE order_id = NEW.order_id), 0.00),
            updated_at = NOW()
        WHERE id = NEW.order_id;

    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.orders
        SET total = COALESCE((SELECT SUM(subtotal) FROM public.order_items WHERE order_id = OLD.order_id), 0.00),
            updated_at = NOW()
        WHERE id = OLD.order_id;

    ELSIF TG_OP = 'UPDATE' THEN
        -- Si el padre no cambia: recalcular el padre actual
        IF NEW.order_id = OLD.order_id THEN
            UPDATE public.orders
            SET total = COALESCE((SELECT SUM(subtotal) FROM public.order_items WHERE order_id = NEW.order_id), 0.00),
                updated_at = NOW()
            WHERE id = NEW.order_id;
        ELSE
            -- Si cambia el padre: recalcular tanto el padre anterior como el nuevo
            UPDATE public.orders
            SET total = COALESCE((SELECT SUM(subtotal) FROM public.order_items WHERE order_id = OLD.order_id), 0.00),
                updated_at = NOW()
            WHERE id = OLD.order_id;

            UPDATE public.orders
            SET total = COALESCE((SELECT SUM(subtotal) FROM public.order_items WHERE order_id = NEW.order_id), 0.00),
                updated_at = NOW()
            WHERE id = NEW.order_id;
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 12.17 Motor Transaccional de Kardex y Bloqueo Pesimista (FOR UPDATE)
CREATE OR REPLACE FUNCTION public.process_inventory_movement()
RETURNS TRIGGER AS $$
DECLARE
    v_current_stock NUMERIC(12,3);
    v_calculated_stock NUMERIC(12,3);
    v_item_name VARCHAR;
    v_item_code VARCHAR;
BEGIN
    -- Bloqueo pesimista de fila para prevenir condiciones de carrera (Race Conditions)
    SELECT current_stock, name, code 
    INTO v_current_stock, v_item_name, v_item_code
    FROM public.inventory_items
    WHERE id = NEW.item_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El ítem de inventario con ID % no existe.', NEW.item_id;
    END IF;

    -- Asignación obligatoria del stock previo real en base de datos
    NEW.previous_stock := v_current_stock;

    -- Cálculo y validación según tipo de movimiento
    IF NEW.movement_type IN ('PURCHASE', 'PRODUCTION') THEN
        IF NEW.quantity <= 0 THEN
            RAISE EXCEPTION 'La cantidad en movimientos % debe ser estrictamente mayor a 0.', NEW.movement_type;
        END IF;
        v_calculated_stock := v_current_stock + NEW.quantity;

    ELSIF NEW.movement_type IN ('MANUAL_OUT', 'WASTE', 'INTERNAL_CONSUMPTION') THEN
        IF NEW.quantity <= 0 THEN
            RAISE EXCEPTION 'La cantidad en movimientos % debe ser estrictamente mayor a 0.', NEW.movement_type;
        END IF;
        IF v_current_stock < NEW.quantity THEN
            RAISE EXCEPTION 'Stock insuficiente para [%] %. Stock disponible: %, Cantidad requerida: %', 
                v_item_code, v_item_name, v_current_stock, NEW.quantity;
        END IF;
        v_calculated_stock := v_current_stock - NEW.quantity;

    ELSIF NEW.movement_type = 'ADJUSTMENT' THEN
        -- Comportamiento estricto de ADJUSTMENT:
        -- previous_stock = stock anterior (v_current_stock)
        -- new_stock = stock físico ajustado
        -- quantity = diferencia absoluta
        -- impedir stock negativo
        IF NEW.new_stock IS NULL THEN
            RAISE EXCEPTION 'Para movimientos de tipo ADJUSTMENT, new_stock es obligatorio.';
        END IF;

        IF NEW.new_stock < 0 THEN
            RAISE EXCEPTION 'El stock resultante tras un ajuste no puede ser negativo para [%] % (Valor provisto: %)',
                v_item_code, v_item_name, NEW.new_stock;
        END IF;

        v_calculated_stock := NEW.new_stock;
        NEW.quantity := ABS(NEW.new_stock - v_current_stock);

    ELSE
        RAISE EXCEPTION 'Tipo de movimiento no soportado: %', NEW.movement_type;
    END IF;

    -- Asignar el nuevo stock al registro del movimiento
    NEW.new_stock := v_calculated_stock;

    -- Actualización atómica de stock en inventory_items (permitida por anidamiento de trigger pg_trigger_depth >= 2)

    UPDATE public.inventory_items
    SET current_stock = v_calculated_stock,
        updated_at = NOW()
    WHERE id = NEW.item_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 12.18 Detección y Gestión de Alertas de Stock (Sin duplicados activos)
CREATE OR REPLACE FUNCTION public.handle_inventory_stock_alerts()
RETURNS TRIGGER AS $$
BEGIN
    -- Caso 1: Stock Agotado (Stock = 0)
    IF NEW.current_stock = 0 THEN
        -- Resolver alerta previa de LOW_STOCK si existía
        UPDATE public.inventory_alerts
        SET status = 'RESOLVED', resolved_at = NOW()
        WHERE item_id = NEW.id AND alert_type = 'LOW_STOCK' AND status = 'ACTIVE';

        -- Generar OUT_OF_STOCK únicamente si no existe ya una alerta activa
        IF NOT EXISTS (
            SELECT 1 FROM public.inventory_alerts 
            WHERE item_id = NEW.id AND alert_type = 'OUT_OF_STOCK' AND status = 'ACTIVE'
        ) THEN
            INSERT INTO public.inventory_alerts (item_id, alert_type, message, status, created_at)
            VALUES (
                NEW.id,
                'OUT_OF_STOCK',
                'ALERTA CRÍTICA: El ítem [' || NEW.code || '] "' || NEW.name || '" se encuentra agotado (Stock: 0).',
                'ACTIVE',
                NOW()
            );
        END IF;

    -- Caso 2: Stock Mínimo o Crítico (0 < Stock <= minimum_stock)
    ELSIF NEW.current_stock <= NEW.minimum_stock THEN
        -- Si venía de agotado, resolver OUT_OF_STOCK
        UPDATE public.inventory_alerts
        SET status = 'RESOLVED', resolved_at = NOW()
        WHERE item_id = NEW.id AND alert_type = 'OUT_OF_STOCK' AND status = 'ACTIVE';

        -- Generar LOW_STOCK únicamente si no existe ya una alerta activa
        IF NOT EXISTS (
            SELECT 1 FROM public.inventory_alerts 
            WHERE item_id = NEW.id AND alert_type = 'LOW_STOCK' AND status = 'ACTIVE'
        ) THEN
            INSERT INTO public.inventory_alerts (item_id, alert_type, message, status, created_at)
            VALUES (
                NEW.id,
                'LOW_STOCK',
                'ALERTA: El ítem [' || NEW.code || '] "' || NEW.name || '" está en o por debajo de su stock mínimo. Stock actual: ' || NEW.current_stock || ' ' || NEW.unit || ' (Mínimo: ' || NEW.minimum_stock || ' ' || NEW.unit || ').',
                'ACTIVE',
                NOW()
            );
        END IF;

    -- Caso 3: Stock Reabastecido (Stock > minimum_stock)
    ELSE
        -- Auto-resolución de alertas activas
        UPDATE public.inventory_alerts
        SET status = 'RESOLVED', resolved_at = NOW()
        WHERE item_id = NEW.id AND status = 'ACTIVE';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================================================
-- SECCIÓN 13: RPC PROCEDURES (CON CONTROL DE IDENTIDAD Y PERMISOS)
-- ============================================================================

-- 13.1 Registro seguro de movimientos de inventario vía RPC
-- ÚNICA VÍA AUTORIZADA para registrar movimientos en inventory_movements.
CREATE OR REPLACE FUNCTION public.register_inventory_movement(
    p_item_id UUID,
    p_movement_type VARCHAR,
    p_quantity NUMERIC,
    p_reason TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_new_stock_for_adjustment NUMERIC DEFAULT NULL
)
RETURNS public.inventory_movements AS $$
DECLARE
    v_user_id UUID;
    v_movement public.inventory_movements;
BEGIN
    -- Resolución de identidad segura contra suplantaciones
    v_user_id := public.resolve_authenticated_user(p_user_id);

    -- Verificación de permiso obligatorio
    IF NOT public.has_permission(v_user_id, 'inventory.movement.create') THEN
        RAISE EXCEPTION 'Permiso denegado: se requiere inventory.movement.create para registrar movimientos.';
    END IF;

    INSERT INTO public.inventory_movements (
        item_id,
        movement_type,
        quantity,
        previous_stock,
        new_stock,
        reason,
        created_by,
        movement_date,
        created_at
    )
    VALUES (
        p_item_id,
        p_movement_type,
        p_quantity,
        0, -- Asignado atómicamente por el trigger process_inventory_movement
        COALESCE(p_new_stock_for_adjustment, 0),
        p_reason,
        v_user_id,
        NOW(),
        NOW()
    )
    RETURNING * INTO v_movement;

    RETURN v_movement;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 13.2 Ejecución transaccional atómica de producción
CREATE OR REPLACE FUNCTION public.execute_production_run(
    p_recipe_id UUID,
    p_quantity_produced NUMERIC,
    p_user_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS public.production_records AS $$
DECLARE
    v_user_id UUID;
    v_recipe public.recipes;
    v_item RECORD;
    v_supply_needed NUMERIC(12,3);
    v_factor NUMERIC(12,6);
    v_record public.production_records;
BEGIN
    -- Resolución de identidad segura
    v_user_id := public.resolve_authenticated_user(p_user_id);

    -- Validación de permiso
    IF NOT public.has_permission(v_user_id, 'production.records.create') THEN
        RAISE EXCEPTION 'Permiso denegado: se requiere production.records.create para registrar producción.';
    END IF;

    -- Validar receta
    SELECT * INTO v_recipe FROM public.recipes WHERE id = p_recipe_id AND is_active = TRUE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Receta con ID % no encontrada o inactiva.', p_recipe_id;
    END IF;

    IF p_quantity_produced <= 0 THEN
        RAISE EXCEPTION 'La cantidad producida debe ser estrictamente mayor a 0.';
    END IF;

    -- Validar que la receta tenga insumos registrados
    IF NOT EXISTS (SELECT 1 FROM public.recipe_items WHERE recipe_id = p_recipe_id) THEN
        RAISE EXCEPTION 'La receta con ID % no posee insumos registrados para procesar producción.', p_recipe_id;
    END IF;

    v_factor := p_quantity_produced / v_recipe.yield_quantity;

    -- 1. Descontar insumos requeridos (INTERNAL_CONSUMPTION)
    FOR v_item IN SELECT supply_id, quantity FROM public.recipe_items WHERE recipe_id = p_recipe_id LOOP
        v_supply_needed := ROUND(v_item.quantity * v_factor, 3);
        
        PERFORM public.register_inventory_movement(
            v_item.supply_id,
            'INTERNAL_CONSUMPTION',
            v_supply_needed,
            'Consumo en producción según receta: ' || v_recipe.name,
            v_user_id
        );
    END LOOP;

    -- 2. Ingresar producto terminado elaborado (PRODUCTION)
    PERFORM public.register_inventory_movement(
        v_recipe.product_id,
        'PRODUCTION',
        p_quantity_produced,
        'Ingreso por producción completada (Receta: ' || v_recipe.name || ')',
        v_user_id
    );

    -- 3. Crear registro histórico de producción
    INSERT INTO public.production_records (
        recipe_id,
        quantity_produced,
        production_date,
        created_by,
        notes,
        created_at
    )
    VALUES (
        p_recipe_id,
        p_quantity_produced,
        NOW(),
        v_user_id,
        p_notes,
        NOW()
    )
    RETURNING * INTO v_record;

    -- 4. Registrar auditoría interna automática de la corrida de producción
    PERFORM public.log_audit_event(
        'EXECUTE_PRODUCTION',
        'production_records',
        v_record.id,
        NULL,
        jsonb_build_object('recipe_id', p_recipe_id, 'quantity_produced', p_quantity_produced),
        v_user_id
    );

    RETURN v_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 13.3 Recepción transaccional atómica de órdenes de compra
CREATE OR REPLACE FUNCTION public.receive_purchase_order(
    p_purchase_order_id UUID,
    p_user_id UUID DEFAULT NULL
)
RETURNS public.purchase_orders AS $$
DECLARE
    v_user_id UUID;
    v_order public.purchase_orders;
    v_item RECORD;
BEGIN
    -- Resolución de identidad segura
    v_user_id := public.resolve_authenticated_user(p_user_id);

    -- Validación de permiso
    IF NOT public.has_permission(v_user_id, 'purchases.manage') THEN
        RAISE EXCEPTION 'Permiso denegado: se requiere purchases.manage para recepcionar órdenes de compra.';
    END IF;

    SELECT * INTO v_order FROM public.purchase_orders WHERE id = p_purchase_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Orden de compra con ID % no encontrada.', p_purchase_order_id;
    END IF;

    IF v_order.status <> 'PENDING' THEN
        RAISE EXCEPTION 'Solo órdenes en estado PENDING pueden recibirse. Estado actual: %', v_order.status;
    END IF;

    -- Validar que la orden tenga ítems
    IF NOT EXISTS (SELECT 1 FROM public.purchase_order_items WHERE purchase_order_id = p_purchase_order_id) THEN
        RAISE EXCEPTION 'La orden de compra no contiene ítems para recepcionar.';
    END IF;

    -- Registrar ingreso de inventario para cada ítem
    FOR v_item IN SELECT item_id, quantity, unit_cost FROM public.purchase_order_items WHERE purchase_order_id = p_purchase_order_id LOOP
        -- Regla actual del sistema: actualizar costo de reposición al último costo recibido
        UPDATE public.inventory_items 
        SET cost = v_item.unit_cost, updated_at = NOW() 
        WHERE id = v_item.item_id;

        PERFORM public.register_inventory_movement(
            v_item.item_id,
            'PURCHASE',
            v_item.quantity,
            'Recepción de Orden de Compra N° ' || substring(p_purchase_order_id::text from 1 for 8),
            v_user_id
        );
    END LOOP;

    -- Actualizar estado a RECEIVED
    UPDATE public.purchase_orders
    SET status = 'RECEIVED', updated_at = NOW()
    WHERE id = p_purchase_order_id
    RETURNING * INTO v_order;

    -- Registrar auditoría interna automática de la recepción
    PERFORM public.log_audit_event(
        'RECEIVE_PURCHASE_ORDER',
        'purchase_orders',
        p_purchase_order_id,
        jsonb_build_object('status', 'PENDING'),
        jsonb_build_object('status', 'RECEIVED', 'total', v_order.total),
        v_user_id
    );

    RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 13.4 Registro controlado de auditoría (FUNCIÓN INTERNA)
-- No expuesta a authenticated, anon ni PUBLIC para evitar creación arbitraria de auditoría.
CREATE OR REPLACE FUNCTION public.log_audit_event(
    p_action VARCHAR,
    p_entity VARCHAR,
    p_entity_id UUID,
    p_old_values JSONB DEFAULT NULL,
    p_new_values JSONB DEFAULT NULL,
    p_user_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
    v_log_id UUID;
BEGIN
    -- Resolución de identidad segura contra suplantaciones
    v_user_id := public.resolve_authenticated_user(p_user_id);

    INSERT INTO public.audit_logs (
        user_id,
        action,
        entity,
        entity_id,
        old_values,
        new_values,
        created_at
    )
    VALUES (
        v_user_id,
        p_action,
        p_entity,
        p_entity_id,
        p_old_values,
        p_new_values,
        NOW()
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================================================
-- CONTROL ESTRICTO DE PRIVILEGIOS DE EJECUCIÓN (REVOKE / GRANT)
-- ============================================================================

-- 1. Funciones internas: Revocadas completamente para PUBLIC, anon y authenticated.
-- Operan exclusivamente de forma interna dentro de funciones SECURITY DEFINER o triggers.
REVOKE EXECUTE ON FUNCTION public.resolve_authenticated_user(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_permission(UUID, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_audit_event(VARCHAR, VARCHAR, UUID, JSONB, JSONB, UUID) FROM PUBLIC, anon, authenticated;

-- 2. RPC públicas autorizadas para authenticated (puntos de entrada de negocio).
-- Denegadas estrictamente para PUBLIC y anon.
REVOKE EXECUTE ON FUNCTION public.register_inventory_movement(UUID, VARCHAR, NUMERIC, TEXT, UUID, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_inventory_movement(UUID, VARCHAR, NUMERIC, TEXT, UUID, NUMERIC) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.execute_production_run(UUID, NUMERIC, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_production_run(UUID, NUMERIC, UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.receive_purchase_order(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(UUID, UUID) TO authenticated;

-- ============================================================================
-- SECCIÓN 14: ASIGNACIÓN DE TRIGGERS
-- ============================================================================

-- Triggers de actualización de updated_at
DROP TRIGGER IF EXISTS trg_roles_updated_at ON public.roles;
CREATE TRIGGER trg_roles_updated_at BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_permissions_updated_at ON public.permissions;
CREATE TRIGGER trg_permissions_updated_at BEFORE UPDATE ON public.permissions FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_inventory_items_updated_at ON public.inventory_items;
CREATE TRIGGER trg_inventory_items_updated_at BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON public.suppliers;
CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_purchase_orders_updated_at ON public.purchase_orders;
CREATE TRIGGER trg_purchase_orders_updated_at BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_recipes_updated_at ON public.recipes;
CREATE TRIGGER trg_recipes_updated_at BEFORE UPDATE ON public.recipes FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_customers_updated_at ON public.customers;
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Trigger sobre auth.users para creación automática de profiles
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Trigger de protección contra escalamiento en profiles
DROP TRIGGER IF EXISTS trg_protect_profile_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_fields
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_profile_sensitive_fields();

-- Triggers de integridad de created_by
DROP TRIGGER IF EXISTS trg_im_created_by ON public.inventory_movements;
CREATE TRIGGER trg_im_created_by BEFORE INSERT ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.enforce_created_by();

DROP TRIGGER IF EXISTS trg_po_created_by ON public.purchase_orders;
CREATE TRIGGER trg_po_created_by BEFORE INSERT ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.enforce_created_by();

DROP TRIGGER IF EXISTS trg_pr_created_by ON public.production_records;
CREATE TRIGGER trg_pr_created_by BEFORE INSERT ON public.production_records FOR EACH ROW EXECUTE FUNCTION public.enforce_created_by();

DROP TRIGGER IF EXISTS trg_order_created_by ON public.orders;
CREATE TRIGGER trg_order_created_by BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.enforce_created_by();

-- Trigger de control estricto de stock inicial (current_stock = 0 al crear ítem)
DROP TRIGGER IF EXISTS trg_enforce_zero_initial_stock ON public.inventory_items;
CREATE TRIGGER trg_enforce_zero_initial_stock
    BEFORE INSERT ON public.inventory_items
    FOR EACH ROW EXECUTE FUNCTION public.enforce_zero_initial_stock();

-- Trigger de protección contra UPDATE directo de stock (pg_trigger_depth >= 2)
DROP TRIGGER IF EXISTS trg_prevent_direct_stock_update ON public.inventory_items;
CREATE TRIGGER trg_prevent_direct_stock_update
    BEFORE UPDATE ON public.inventory_items
    FOR EACH ROW EXECUTE FUNCTION public.prevent_direct_stock_update();

-- Trigger de protección de consistencia de item_type (PRODUCT <-> SUPPLY)
DROP TRIGGER IF EXISTS trg_protect_inventory_item_type ON public.inventory_items;
CREATE TRIGGER trg_protect_inventory_item_type
    BEFORE UPDATE OF item_type ON public.inventory_items
    FOR EACH ROW EXECUTE FUNCTION public.protect_inventory_item_type();

-- Trigger de protección de asignación y modificación de costo confidencial
DROP TRIGGER IF EXISTS trg_protect_inventory_cost ON public.inventory_items;
CREATE TRIGGER trg_protect_inventory_cost
    BEFORE INSERT OR UPDATE OF cost ON public.inventory_items
    FOR EACH ROW EXECUTE FUNCTION public.protect_inventory_cost();

-- Triggers de validación de recetas
DROP TRIGGER IF EXISTS trg_val_recipe_product ON public.recipes;
CREATE TRIGGER trg_val_recipe_product BEFORE INSERT OR UPDATE ON public.recipes FOR EACH ROW EXECUTE FUNCTION public.validate_recipe_product();

DROP TRIGGER IF EXISTS trg_val_recipe_supply ON public.recipe_items;
CREATE TRIGGER trg_val_recipe_supply BEFORE INSERT OR UPDATE ON public.recipe_items FOR EACH ROW EXECUTE FUNCTION public.validate_recipe_supply();

-- Triggers de subtotales y totales para compras
DROP TRIGGER IF EXISTS trg_poi_subtotal ON public.purchase_order_items;
CREATE TRIGGER trg_poi_subtotal BEFORE INSERT OR UPDATE ON public.purchase_order_items FOR EACH ROW EXECUTE FUNCTION public.calculate_po_item_subtotal();

DROP TRIGGER IF EXISTS trg_sync_po_total ON public.purchase_order_items;
CREATE TRIGGER trg_sync_po_total AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_items FOR EACH ROW EXECUTE FUNCTION public.sync_po_total();

-- Triggers de subtotales y totales para pedidos
DROP TRIGGER IF EXISTS trg_order_item_subtotal ON public.order_items;
CREATE TRIGGER trg_order_item_subtotal BEFORE INSERT OR UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.calculate_order_item_subtotal();

DROP TRIGGER IF EXISTS trg_sync_order_total ON public.order_items;
CREATE TRIGGER trg_sync_order_total AFTER INSERT OR UPDATE OR DELETE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.sync_order_total();

-- Trigger de Kardex y actualización atómica de stock
DROP TRIGGER IF EXISTS trg_process_inventory_movement ON public.inventory_movements;
CREATE TRIGGER trg_process_inventory_movement
    BEFORE INSERT ON public.inventory_movements
    FOR EACH ROW EXECUTE FUNCTION public.process_inventory_movement();

-- Trigger de detección de stock mínimo y agotado
DROP TRIGGER IF EXISTS trg_inventory_stock_alerts ON public.inventory_items;
CREATE TRIGGER trg_inventory_stock_alerts
    AFTER UPDATE OF current_stock ON public.inventory_items
    FOR EACH ROW EXECUTE FUNCTION public.handle_inventory_stock_alerts();

-- ============================================================================
-- SECCIÓN 15: PROTECCIÓN ESTRICTA DE COSTOS Y PRIVILEGIOS DE COLUMNAS
-- ============================================================================

-- 15.1 Privilegios estrictos de columnas en inventory_items
-- Denegar acceso completo a usuarios anónimos
REVOKE ALL ON public.inventory_items FROM anon;
REVOKE EXECUTE ON FUNCTION public.protect_inventory_cost() FROM PUBLIC, anon;

-- Denegar lectura de la columna confidencial cost al rol authenticated
REVOKE SELECT (cost) ON public.inventory_items FROM authenticated;
GRANT SELECT (id, code, name, description, item_type, unit, sale_price, current_stock, minimum_stock, is_active, created_at, updated_at) 
ON public.inventory_items TO authenticated;

-- Denegar inserción y modificación de current_stock al rol authenticated
REVOKE INSERT (current_stock) ON public.inventory_items FROM authenticated;
GRANT INSERT (code, name, description, item_type, unit, cost, sale_price, minimum_stock, is_active) 
ON public.inventory_items TO authenticated;

REVOKE UPDATE (current_stock) ON public.inventory_items FROM authenticated;
GRANT UPDATE (code, name, description, item_type, unit, cost, sale_price, minimum_stock, is_active) 
ON public.inventory_items TO authenticated;

-- 15.2 Vista segura con enmascaramiento dinámico de costos
-- Arquitectura de seguridad en PostgreSQL:
-- 1. La vista es propiedad del superusuario/owner (postgres) y se define con security_barrier = true.
--    No utiliza security_invoker = true para que el owner (postgres) evalúe la expresión CASE.
-- 2. La columna 'cost' se evalúa dinámicamente:
--    - Si el usuario autenticado posee 'inventory.cost.view' (ADMIN / GERENTE), retorna el valor decimal real.
--    - Si el usuario carece del permiso (EMPLEADO), retorna estrictamente NULL.
-- 3. La cláusula WHERE filtra con has_permission(auth.uid(), 'inventory.view'), impidiendo cualquier
--    lectura a usuarios sin acceso al catálogo.
-- 4. El intento de consultar 'cost' directamente en inventory_items es rechazado por los privilegios de columna.
CREATE OR REPLACE VIEW public.inventory_catalog 
WITH (security_barrier = true) AS
SELECT 
    i.id,
    i.code,
    i.name,
    i.description,
    i.item_type,
    i.unit,
    CASE 
        WHEN public.has_permission(auth.uid(), 'inventory.cost.view') 
        THEN i.cost 
        ELSE NULL 
    END AS cost,
    i.sale_price,
    i.current_stock,
    i.minimum_stock,
    i.is_active,
    i.created_at,
    i.updated_at
FROM public.inventory_items i
WHERE public.has_permission(auth.uid(), 'inventory.view');

COMMENT ON VIEW public.inventory_catalog IS 'Vista segura con enmascaramiento dinámico de costos. Requiere inventory.view e inventory.cost.view';

-- Restricción de acceso a la vista: anon queda denegado; authenticated autorizado
REVOKE ALL ON public.inventory_catalog FROM PUBLIC, anon;
GRANT SELECT ON public.inventory_catalog TO authenticated;

-- ============================================================================
-- SECCIÓN 16: ROW LEVEL SECURITY (RLS) Y POLÍTICAS DE ACCESO AUDITADAS
-- ============================================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 16.1 Políticas: roles, permissions, role_permissions
DROP POLICY IF EXISTS "Lectura de roles autenticados" ON public.roles;
CREATE POLICY "Lectura de roles autenticados" ON public.roles 
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Administración total de roles" ON public.roles;
CREATE POLICY "Administración total de roles" ON public.roles 
FOR ALL TO authenticated 
USING (public.is_admin(auth.uid())) 
WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Lectura de permisos autenticados" ON public.permissions;
CREATE POLICY "Lectura de permisos autenticados" ON public.permissions 
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Administración total de permisos" ON public.permissions;
CREATE POLICY "Administración total de permisos" ON public.permissions 
FOR ALL TO authenticated 
USING (public.is_admin(auth.uid())) 
WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Lectura de rol_permisos autenticados" ON public.role_permissions;
CREATE POLICY "Lectura de rol_permisos autenticados" ON public.role_permissions 
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Administración de rol_permisos" ON public.role_permissions;
CREATE POLICY "Administración de rol_permisos" ON public.role_permissions 
FOR ALL TO authenticated 
USING (public.is_admin(auth.uid())) 
WITH CHECK (public.is_admin(auth.uid()));

-- 16.2 Políticas: profiles y user_permissions
DROP POLICY IF EXISTS "Lectura de perfiles" ON public.profiles;
CREATE POLICY "Lectura de perfiles" ON public.profiles 
FOR SELECT TO authenticated 
USING (auth.uid() = id OR public.has_permission(auth.uid(), 'users.view'));

DROP POLICY IF EXISTS "Actualización de perfiles" ON public.profiles;
CREATE POLICY "Actualización de perfiles" ON public.profiles 
FOR UPDATE TO authenticated 
USING (auth.uid() = id OR public.has_permission(auth.uid(), 'users.manage'))
WITH CHECK (auth.uid() = id OR public.has_permission(auth.uid(), 'users.manage'));

DROP POLICY IF EXISTS "Inserción de perfiles autorizados" ON public.profiles;
CREATE POLICY "Inserción de perfiles autorizados" ON public.profiles 
FOR INSERT TO authenticated 
WITH CHECK (auth.uid() = id OR public.has_permission(auth.uid(), 'users.manage'));

DROP POLICY IF EXISTS "Lectura de permisos de usuario" ON public.user_permissions;
CREATE POLICY "Lectura de permisos de usuario" ON public.user_permissions 
FOR SELECT TO authenticated 
USING (auth.uid() = user_id OR public.has_permission(auth.uid(), 'users.view'));

DROP POLICY IF EXISTS "Gestión de permisos de usuario" ON public.user_permissions;
CREATE POLICY "Gestión de permisos de usuario" ON public.user_permissions 
FOR ALL TO authenticated 
USING (public.has_permission(auth.uid(), 'roles.manage') OR public.is_admin(auth.uid()))
WITH CHECK (public.has_permission(auth.uid(), 'roles.manage') OR public.is_admin(auth.uid()));

-- 16.3 Políticas: inventory_items
DROP POLICY IF EXISTS "Lectura de inventario" ON public.inventory_items;
CREATE POLICY "Lectura de inventario" ON public.inventory_items 
FOR SELECT TO authenticated 
USING (public.has_permission(auth.uid(), 'inventory.view'));

DROP POLICY IF EXISTS "Creación de inventario" ON public.inventory_items;
CREATE POLICY "Creación de inventario" ON public.inventory_items 
FOR INSERT TO authenticated 
WITH CHECK (public.has_permission(auth.uid(), 'inventory.manage'));

DROP POLICY IF EXISTS "Actualización de inventario" ON public.inventory_items;
CREATE POLICY "Actualización de inventario" ON public.inventory_items 
FOR UPDATE TO authenticated 
USING (public.has_permission(auth.uid(), 'inventory.manage'))
WITH CHECK (public.has_permission(auth.uid(), 'inventory.manage'));

DROP POLICY IF EXISTS "Eliminación de inventario" ON public.inventory_items;
CREATE POLICY "Eliminación de inventario" ON public.inventory_items 
FOR DELETE TO authenticated 
USING (public.is_admin(auth.uid()));

-- 16.4 Políticas: inventory_movements (Kardex inmutable: solo SELECT para usuarios autorizados)
-- NOTA CRÍTICA DE ARQUITECTURA: Se elimina deliberadamente cualquier política de INSERT directo para 'authenticated'.
-- Los movimientos de inventario DEBEN registrarse exclusivamente a través de la RPC controlada
-- register_inventory_movement() (SECURITY DEFINER) para garantizar que todo movimiento pase por
-- el bloqueo pesimista FOR UPDATE y el cálculo atómico de stock.
DROP POLICY IF EXISTS "Lectura de movimientos" ON public.inventory_movements;
CREATE POLICY "Lectura de movimientos" ON public.inventory_movements 
FOR SELECT TO authenticated 
USING (public.has_permission(auth.uid(), 'inventory.view'));

DROP POLICY IF EXISTS "Inserción de movimientos" ON public.inventory_movements;
-- Ninguna política de INSERT, UPDATE o DELETE directa para authenticated en inventory_movements.

-- 16.5 Políticas: suppliers
DROP POLICY IF EXISTS "Lectura de proveedores" ON public.suppliers;
CREATE POLICY "Lectura de proveedores" ON public.suppliers 
FOR SELECT TO authenticated 
USING (public.has_permission(auth.uid(), 'purchases.view') OR public.has_permission(auth.uid(), 'suppliers.manage'));

DROP POLICY IF EXISTS "Creación de proveedores" ON public.suppliers;
CREATE POLICY "Creación de proveedores" ON public.suppliers 
FOR INSERT TO authenticated 
WITH CHECK (public.has_permission(auth.uid(), 'suppliers.manage'));

DROP POLICY IF EXISTS "Actualización de proveedores" ON public.suppliers;
CREATE POLICY "Actualización de proveedores" ON public.suppliers 
FOR UPDATE TO authenticated 
USING (public.has_permission(auth.uid(), 'suppliers.manage'))
WITH CHECK (public.has_permission(auth.uid(), 'suppliers.manage'));

-- 16.6 Políticas: purchase_orders y purchase_order_items
DROP POLICY IF EXISTS "Lectura de compras" ON public.purchase_orders;
CREATE POLICY "Lectura de compras" ON public.purchase_orders 
FOR SELECT TO authenticated 
USING (public.has_permission(auth.uid(), 'purchases.view'));

DROP POLICY IF EXISTS "Creación de compras" ON public.purchase_orders;
CREATE POLICY "Creación de compras" ON public.purchase_orders 
FOR INSERT TO authenticated 
WITH CHECK (
    public.has_permission(auth.uid(), 'purchases.create')
    AND created_by = auth.uid()
);

DROP POLICY IF EXISTS "Actualización de compras" ON public.purchase_orders;
CREATE POLICY "Actualización de compras" ON public.purchase_orders 
FOR UPDATE TO authenticated 
USING (public.has_permission(auth.uid(), 'purchases.manage'))
WITH CHECK (public.has_permission(auth.uid(), 'purchases.manage'));

DROP POLICY IF EXISTS "Lectura de ítems de compra" ON public.purchase_order_items;
CREATE POLICY "Lectura de ítems de compra" ON public.purchase_order_items 
FOR SELECT TO authenticated 
USING (public.has_permission(auth.uid(), 'purchases.view'));

DROP POLICY IF EXISTS "Inserción de ítems de compra" ON public.purchase_order_items;
CREATE POLICY "Inserción de ítems de compra" ON public.purchase_order_items 
FOR INSERT TO authenticated 
WITH CHECK (public.has_permission(auth.uid(), 'purchases.create') OR public.has_permission(auth.uid(), 'purchases.manage'));

DROP POLICY IF EXISTS "Actualización de ítems de compra" ON public.purchase_order_items;
CREATE POLICY "Actualización de ítems de compra" ON public.purchase_order_items 
FOR UPDATE TO authenticated 
USING (public.has_permission(auth.uid(), 'purchases.manage'))
WITH CHECK (public.has_permission(auth.uid(), 'purchases.manage'));

DROP POLICY IF EXISTS "Eliminación de ítems de compra" ON public.purchase_order_items;
CREATE POLICY "Eliminación de ítems de compra" ON public.purchase_order_items 
FOR DELETE TO authenticated 
USING (public.has_permission(auth.uid(), 'purchases.manage'));

-- 16.7 Políticas: recipes, recipe_items y production_records
DROP POLICY IF EXISTS "Lectura de recetas" ON public.recipes;
CREATE POLICY "Lectura de recetas" ON public.recipes 
FOR SELECT TO authenticated 
USING (public.has_permission(auth.uid(), 'production.recipes.view'));

DROP POLICY IF EXISTS "Creación de recetas" ON public.recipes;
CREATE POLICY "Creación de recetas" ON public.recipes 
FOR INSERT TO authenticated 
WITH CHECK (public.has_permission(auth.uid(), 'production.recipes.manage'));

DROP POLICY IF EXISTS "Actualización de recetas" ON public.recipes;
CREATE POLICY "Actualización de recetas" ON public.recipes 
FOR UPDATE TO authenticated 
USING (public.has_permission(auth.uid(), 'production.recipes.manage'))
WITH CHECK (public.has_permission(auth.uid(), 'production.recipes.manage'));

DROP POLICY IF EXISTS "Lectura de ítems de receta" ON public.recipe_items;
CREATE POLICY "Lectura de ítems de receta" ON public.recipe_items 
FOR SELECT TO authenticated 
USING (public.has_permission(auth.uid(), 'production.recipes.view'));

DROP POLICY IF EXISTS "Inserción de ítems de receta" ON public.recipe_items;
CREATE POLICY "Inserción de ítems de receta" ON public.recipe_items 
FOR INSERT TO authenticated 
WITH CHECK (public.has_permission(auth.uid(), 'production.recipes.manage'));

DROP POLICY IF EXISTS "Actualización de ítems de receta" ON public.recipe_items;
CREATE POLICY "Actualización de ítems de receta" ON public.recipe_items 
FOR UPDATE TO authenticated 
USING (public.has_permission(auth.uid(), 'production.recipes.manage'))
WITH CHECK (public.has_permission(auth.uid(), 'production.recipes.manage'));

DROP POLICY IF EXISTS "Eliminación de ítems de receta" ON public.recipe_items;
CREATE POLICY "Eliminación de ítems de receta" ON public.recipe_items 
FOR DELETE TO authenticated 
USING (public.has_permission(auth.uid(), 'production.recipes.manage'));

DROP POLICY IF EXISTS "Lectura de registros de producción" ON public.production_records;
CREATE POLICY "Lectura de registros de producción" ON public.production_records 
FOR SELECT TO authenticated 
USING (public.has_permission(auth.uid(), 'production.records.view'));

DROP POLICY IF EXISTS "Creación de registros de producción" ON public.production_records;
CREATE POLICY "Creación de registros de producción" ON public.production_records 
FOR INSERT TO authenticated 
WITH CHECK (
    public.has_permission(auth.uid(), 'production.records.create')
    AND created_by = auth.uid()
);

-- 16.8 Políticas: customers
DROP POLICY IF EXISTS "Lectura de clientes" ON public.customers;
CREATE POLICY "Lectura de clientes" ON public.customers 
FOR SELECT TO authenticated 
USING (public.has_permission(auth.uid(), 'customers.view') OR public.has_permission(auth.uid(), 'orders.create'));

DROP POLICY IF EXISTS "Creación de clientes" ON public.customers;
CREATE POLICY "Creación de clientes" ON public.customers 
FOR INSERT TO authenticated 
WITH CHECK (public.has_permission(auth.uid(), 'customers.manage'));

DROP POLICY IF EXISTS "Actualización de clientes" ON public.customers;
CREATE POLICY "Actualización de clientes" ON public.customers 
FOR UPDATE TO authenticated 
USING (public.has_permission(auth.uid(), 'customers.manage'))
WITH CHECK (public.has_permission(auth.uid(), 'customers.manage'));

-- 16.9 Políticas: orders y order_items
DROP POLICY IF EXISTS "Lectura de pedidos" ON public.orders;
CREATE POLICY "Lectura de pedidos" ON public.orders 
FOR SELECT TO authenticated 
USING (public.has_permission(auth.uid(), 'orders.view'));

DROP POLICY IF EXISTS "Creación de pedidos" ON public.orders;
CREATE POLICY "Creación de pedidos" ON public.orders 
FOR INSERT TO authenticated 
WITH CHECK (
    public.has_permission(auth.uid(), 'orders.create')
    AND created_by = auth.uid()
);

DROP POLICY IF EXISTS "Actualización de pedidos" ON public.orders;
CREATE POLICY "Actualización de pedidos" ON public.orders 
FOR UPDATE TO authenticated 
USING (public.has_permission(auth.uid(), 'orders.status.update') OR public.has_permission(auth.uid(), 'orders.cancel'))
WITH CHECK (public.has_permission(auth.uid(), 'orders.status.update') OR public.has_permission(auth.uid(), 'orders.cancel'));

DROP POLICY IF EXISTS "Lectura de ítems de pedidos" ON public.order_items;
CREATE POLICY "Lectura de ítems de pedidos" ON public.order_items 
FOR SELECT TO authenticated 
USING (public.has_permission(auth.uid(), 'orders.view'));

DROP POLICY IF EXISTS "Inserción de ítems de pedidos" ON public.order_items;
CREATE POLICY "Inserción de ítems de pedidos" ON public.order_items 
FOR INSERT TO authenticated 
WITH CHECK (public.has_permission(auth.uid(), 'orders.create'));

DROP POLICY IF EXISTS "Actualización de ítems de pedidos" ON public.order_items;
CREATE POLICY "Actualización de ítems de pedidos" ON public.order_items 
FOR UPDATE TO authenticated 
USING (public.has_permission(auth.uid(), 'orders.create') OR public.has_permission(auth.uid(), 'orders.status.update'))
WITH CHECK (public.has_permission(auth.uid(), 'orders.create') OR public.has_permission(auth.uid(), 'orders.status.update'));

DROP POLICY IF EXISTS "Eliminación de ítems de pedidos" ON public.order_items;
CREATE POLICY "Eliminación de ítems de pedidos" ON public.order_items 
FOR DELETE TO authenticated 
USING (public.has_permission(auth.uid(), 'orders.create'));

-- 16.10 Políticas: inventory_alerts
DROP POLICY IF EXISTS "Lectura de alertas" ON public.inventory_alerts;
CREATE POLICY "Lectura de alertas" ON public.inventory_alerts 
FOR SELECT TO authenticated 
USING (public.has_permission(auth.uid(), 'inventory.view'));

DROP POLICY IF EXISTS "Gestión de alertas" ON public.inventory_alerts;
CREATE POLICY "Gestión de alertas" ON public.inventory_alerts 
FOR UPDATE TO authenticated 
USING (public.has_permission(auth.uid(), 'inventory.alerts.manage'))
WITH CHECK (public.has_permission(auth.uid(), 'inventory.alerts.manage'));

-- 16.11 Políticas: audit_logs (Inserción directa denegada, lectura según permiso)
DROP POLICY IF EXISTS "Lectura de bitácora de auditoría" ON public.audit_logs;
CREATE POLICY "Lectura de bitácora de auditoría" ON public.audit_logs 
FOR SELECT TO authenticated 
USING (public.has_permission(auth.uid(), 'audit.view'));

-- ============================================================================
-- SECCIÓN 17: DATOS INICIALES (ROLES, PERMISOS Y ASIGNACIONES)
-- ============================================================================

-- 17.1 Roles Iniciales
INSERT INTO public.roles (id, name, description) VALUES
    ('00000000-0000-0000-0000-000000000001', 'ADMIN', 'Administrador con acceso irrestricto y control integral del sistema'),
    ('00000000-0000-0000-0000-000000000002', 'GERENTE', 'Supervisión de compras, inventarios, producción, pedidos y reportes'),
    ('00000000-0000-0000-0000-000000000003', 'EMPLEADO', 'Operación de pedidos, ejecución de órdenes de producción y consulta básica')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

-- 17.2 Catálogo Consistente de Permisos
INSERT INTO public.permissions (name, module, description) VALUES
    -- Módulo: Usuarios y Seguridad
    ('users.view', 'usuarios', 'Consultar listado y perfiles de usuarios'),
    ('users.manage', 'usuarios', 'Crear, editar perfiles, cambiar roles y activar/desactivar usuarios'),
    ('roles.manage', 'usuarios', 'Gestionar roles y asignación de permisos'),

    -- Módulo: Inventario
    ('inventory.view', 'inventario', 'Consultar catálogo de ítems, insumos y niveles de stock'),
    ('inventory.cost.view', 'inventario', 'Consultar costos unitarios confidenciales'),
    ('inventory.manage', 'inventario', 'Crear y editar fichas de productos e insumos'),
    ('inventory.movement.create', 'inventario', 'Registrar movimientos de inventario, salidas, mermas y ajustes'),
    ('inventory.alerts.manage', 'inventario', 'Gestionar y resolver alertas de stock'),

    -- Módulo: Proveedores y Compras
    ('suppliers.manage', 'compras', 'Crear y administrar catálogo de proveedores'),
    ('purchases.view', 'compras', 'Consultar órdenes de compra'),
    ('purchases.create', 'compras', 'Emitir nuevas órdenes de compra'),
    ('purchases.manage', 'compras', 'Cambiar estado, cancelar y recepcionar compras'),

    -- Módulo: Producción y Recetas
    ('production.recipes.view', 'produccion', 'Consultar recetas y fórmulas maestras'),
    ('production.recipes.manage', 'produccion', 'Crear y editar recetas e ingredientes requeridos'),
    ('production.records.create', 'produccion', 'Ejecutar corridas de producción y consumo de insumos'),
    ('production.records.view', 'produccion', 'Consultar histórico de lotes producidos'),

    -- Módulo: Clientes
    ('customers.view', 'clientes', 'Consultar catálogo de clientes'),
    ('customers.manage', 'clientes', 'Crear y editar datos de clientes'),

    -- Módulo: Pedidos
    ('orders.view', 'pedidos', 'Consultar pedidos y detalles'),
    ('orders.create', 'pedidos', 'Tomar y registrar pedidos de clientes'),
    ('orders.status.update', 'pedidos', 'Avanzar estado operativo del pedido (preparación, entrega)'),
    ('orders.cancel', 'pedidos', 'Cancelar pedidos de clientes'),

    -- Módulo: Reportes
    ('reports.inventory', 'reportes', 'Generar reportes de rotación, stock y valorización'),
    ('reports.purchases', 'reportes', 'Generar reportes de costos de compras y proveedores'),
    ('reports.production', 'reportes', 'Generar reportes de costos y rendimiento de producción'),
    ('reports.sales', 'reportes', 'Generar reportes de ventas y pedidos'),

    -- Módulo: Auditoría
    ('audit.view', 'auditoria', 'Consultar bitácora central de auditoría')
ON CONFLICT (name) DO UPDATE SET 
    module = EXCLUDED.module,
    description = EXCLUDED.description;

-- 17.3 Asignación de Permisos a Roles
-- Rol ADMIN: Todos los permisos
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'ADMIN'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Rol GERENTE: Gestión operativa completa
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.name IN (
    'users.view',
    'inventory.view',
    'inventory.cost.view',
    'inventory.manage',
    'inventory.movement.create',
    'inventory.alerts.manage',
    'suppliers.manage',
    'purchases.view',
    'purchases.create',
    'purchases.manage',
    'production.recipes.view',
    'production.recipes.manage',
    'production.records.create',
    'production.records.view',
    'customers.view',
    'customers.manage',
    'orders.view',
    'orders.create',
    'orders.status.update',
    'orders.cancel',
    'reports.inventory',
    'reports.purchases',
    'reports.production',
    'reports.sales',
    'audit.view'
)
WHERE r.name = 'GERENTE'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Rol EMPLEADO: Operaciones diarias sin acceso a costos confidenciales
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.name IN (
    'inventory.view',
    'inventory.movement.create',
    'production.recipes.view',
    'production.records.create',
    'production.records.view',
    'customers.view',
    'customers.manage',
    'orders.view',
    'orders.create',
    'orders.status.update'
)
WHERE r.name = 'EMPLEADO'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================================================
-- FIN DEL ESQUEMA SQL DEFINITIVO
-- ============================================================================
