-- ============================================================================
-- BOTIQUÍN VIRTUAL - ESQUEMA DE BASE DE DATOS SUPABASE
-- Ejecutá este script en el SQL Editor de tu proyecto Supabase para crear
-- las tablas relacionales (además de la sincronización automática en Storage).
-- ============================================================================

-- 1. Tabla de Medicamentos del Stock
CREATE TABLE IF NOT EXISTS public.botiquin_medicamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  droga TEXT NOT NULL DEFAULT '',
  concentracion TEXT NOT NULL DEFAULT '',
  publico TEXT NOT NULL DEFAULT 'adulto', -- 'adulto' | 'pediatrico' | 'ambos'
  categoria TEXT NOT NULL DEFAULT 'General',
  unidad TEXT NOT NULL DEFAULT 'comprimidos', -- 'comprimidos' | 'ml' | 'gotas' | 'sobres' | 'ampollas' | 'g' | 'unidades'
  cantidad_actual NUMERIC NOT NULL DEFAULT 0,
  cantidad_inicial NUMERIC NOT NULL DEFAULT 0,
  stock_minimo NUMERIC NOT NULL DEFAULT 1,
  fecha_vencimiento DATE,
  para_que_sirve TEXT NOT NULL DEFAULT '',
  posologia_referencia TEXT NOT NULL DEFAULT '',
  notas TEXT NOT NULL DEFAULT '',
  foto_url TEXT,
  fotos_urls TEXT[] NOT NULL DEFAULT '{}',
  es_esencial BOOLEAN NOT NULL DEFAULT false,
  esencial_id TEXT,
  estado TEXT NOT NULL DEFAULT 'activo', -- 'activo' | 'baja'
  motivo_baja TEXT, -- 'vencido' | 'tirado' | 'perdido' | 'agotado'
  fecha_baja TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tabla de Productos de Primera Necesidad (Esenciales)
CREATE TABLE IF NOT EXISTS public.botiquin_esenciales (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  droga_sugerida TEXT NOT NULL DEFAULT '',
  publico TEXT NOT NULL DEFAULT 'ambos', -- 'adulto' | 'pediatrico' | 'ambos'
  categoria TEXT NOT NULL DEFAULT 'General',
  stock_minimo_sugerido NUMERIC NOT NULL DEFAULT 1,
  unidad_sugerida TEXT NOT NULL DEFAULT 'unidades',
  keywords TEXT[] NOT NULL DEFAULT '{}',
  descripcion TEXT NOT NULL DEFAULT '',
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Tabla de Historial de Movimientos (Consumos de dosis, altas, bajas, reposiciones)
CREATE TABLE IF NOT EXISTS public.botiquin_movimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medicamento_id UUID,
  medicamento_nombre TEXT NOT NULL,
  tipo TEXT NOT NULL, -- 'alta' | 'consumo' | 'reposicion' | 'baja' | 'edicion'
  cantidad NUMERIC NOT NULL DEFAULT 0,
  unidad TEXT NOT NULL DEFAULT 'unidades',
  motivo TEXT NOT NULL DEFAULT '',
  usuario_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Tabla de Configuración del Botiquín y Alertas
CREATE TABLE IF NOT EXISTS public.botiquin_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  email_alertas TEXT NOT NULL DEFAULT 'aeterzano@gmail.com',
  dias_proximo_vencer INTEGER NOT NULL DEFAULT 30,
  alertar_proximo_vencer BOOLEAN NOT NULL DEFAULT true,
  alertar_vencido BOOLEAN NOT NULL DEFAULT true,
  alertar_esencial_faltante BOOLEAN NOT NULL DEFAULT true,
  alertar_sin_stock BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Tabla de Registro de Alertas Enviadas por Email
CREATE TABLE IF NOT EXISTS public.botiquin_alertas_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL, -- 'proximo_vencer' | 'vencido' | 'esencial_faltante' | 'sin_stock' | 'resumen'
  titulo TEXT NOT NULL,
  detalle TEXT NOT NULL,
  destinatario TEXT NOT NULL DEFAULT 'aeterzano@gmail.com',
  clave_dedup TEXT NOT NULL,
  enviado_ok BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Permisos para service_role y usuarios autenticados
ALTER TABLE public.botiquin_medicamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.botiquin_esenciales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.botiquin_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.botiquin_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.botiquin_alertas_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all authenticated botiquin_medicamentos" ON public.botiquin_medicamentos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all authenticated botiquin_esenciales" ON public.botiquin_esenciales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all authenticated botiquin_movimientos" ON public.botiquin_movimientos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all authenticated botiquin_config" ON public.botiquin_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all authenticated botiquin_alertas_log" ON public.botiquin_alertas_log FOR ALL USING (true) WITH CHECK (true);
