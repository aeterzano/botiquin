-- ============================================================================
-- ESQUEMA DE TABLAS PARA SUPABASE (TABLE EDITOR) - BOTIQUÍN VIRTUAL
-- Todas las tablas comienzan con el prefijo "botiquin-" para diferenciarlas
-- fácilmente de las tablas de Gastos e Inversiones.
-- ============================================================================

-- 1. Stock de Medicamentos ("botiquin-stock")
CREATE TABLE IF NOT EXISTS public."botiquin-stock" (
  id text PRIMARY KEY,
  nombre text NOT NULL,
  droga text DEFAULT '',
  concentracion text DEFAULT '',
  publico text DEFAULT 'adulto',
  categoria text DEFAULT 'Otro',
  unidad text DEFAULT 'comprimidos',
  cantidad_actual numeric DEFAULT 0,
  cantidad_inicial numeric DEFAULT 0,
  stock_minimo numeric DEFAULT 0,
  fecha_vencimiento text,
  para_que_sirve text DEFAULT '',
  posologia_referencia text DEFAULT '',
  notas text DEFAULT '',
  foto_url text,
  fotos_urls jsonb DEFAULT '[]'::jsonb,
  es_esencial boolean DEFAULT false,
  esencial_id text,
  estado text DEFAULT 'activo',
  motivo_baja text,
  fecha_baja text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Miembros de la Familia ("botiquin-familiares")
CREATE TABLE IF NOT EXISTS public."botiquin-familiares" (
  id text PRIMARY KEY,
  nombre text NOT NULL,
  fecha_nacimiento text NOT NULL,
  peso_kg numeric,
  antecedentes_medicos text DEFAULT '',
  dolores_recurrentes text DEFAULT '',
  alergias text DEFAULT '',
  medicacion_habitual text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Catálogo de Productos Esenciales ("botiquin-esenciales")
CREATE TABLE IF NOT EXISTS public."botiquin-esenciales" (
  id text PRIMARY KEY,
  nombre text NOT NULL,
  droga_sugerida text DEFAULT '',
  publico text DEFAULT 'ambos',
  categoria text DEFAULT 'Otro',
  stock_minimo_sugerido numeric DEFAULT 1,
  unidad_sugerida text DEFAULT 'unidades',
  keywords jsonb DEFAULT '[]'::jsonb,
  descripcion text DEFAULT '',
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 4. Movimientos y Consumos de Stock ("botiquin-movimientos")
CREATE TABLE IF NOT EXISTS public."botiquin-movimientos" (
  id text PRIMARY KEY,
  medicamento_id text NOT NULL,
  medicamento_nombre text NOT NULL,
  tipo text NOT NULL,
  cantidad numeric DEFAULT 0,
  unidad text DEFAULT '',
  motivo text DEFAULT '',
  usuario_email text DEFAULT '',
  familiar_id text,
  familiar_nombre text,
  created_at timestamptz DEFAULT now()
);

-- 5. Historial de Consultas al Dr. Botiquín IA ("botiquin-historial")
CREATE TABLE IF NOT EXISTS public."botiquin-historial" (
  id text PRIMARY KEY,
  familiar_id text,
  paciente_nombre text NOT NULL,
  paciente_publico text DEFAULT 'adulto',
  edad_texto text DEFAULT '',
  peso_kg numeric,
  consulta text NOT NULL,
  respuesta_markdown text NOT NULL,
  "aiData" jsonb,
  created_at timestamptz DEFAULT now()
);

-- 6. Registro de Alertas Enviadas ("botiquin-alertas")
CREATE TABLE IF NOT EXISTS public."botiquin-alertas" (
  id text PRIMARY KEY,
  tipo text NOT NULL,
  titulo text NOT NULL,
  detalle text DEFAULT '',
  destinatario text DEFAULT '',
  clave_dedup text DEFAULT '',
  enviado_ok boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 7. Configuración General y de Alertas ("botiquin-config")
CREATE TABLE IF NOT EXISTS public."botiquin-config" (
  id text PRIMARY KEY,
  email_alertas text NOT NULL,
  dias_proximo_vencer integer DEFAULT 30,
  alertar_proximo_vencer boolean DEFAULT true,
  alertar_vencido boolean DEFAULT true,
  alertar_esencial_faltante boolean DEFAULT true,
  alertar_sin_stock boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);
