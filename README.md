# Botiquín Virtual Familiar 🏥

Aplicación web full-stack (Desktop y Mobile) desarrollada en **Next.js + React + Tailwind CSS + Supabase + Google Gemini AI** para gestionar el stock de medicamentos pediátricos y de adultos, controlar fechas de vencimiento, recibir alertas automáticas por email y realizar consultas médicas inteligentes sobre el stock.

## Funcionalidades Principales

1. **Carga Inteligente de Medicamentos (con Foto + IA Vision)**:
   - Sacá o subí una foto del envase, blíster o prospecto desde el celular o la computadora.
   - **Google Gemini Vision (`gemini-2.5-flash`)** lee automáticamente el nombre comercial, droga, concentración, si es **Pediátrico / Adulto / Familiar**, categoría, presentación (`comprimidos`, `ml`, `gotas`, `sobres`, etc.), fecha de vencimiento y posología de referencia.
   - Las fotos se almacenan en el bucket `botiquin` de **Supabase Storage**.

2. **Control de Stock, Dosis y Bajas**:
   - Visualización de stock disponible (pastillas / ml / gotas / sobres) con barras de progreso y semáforo de vencimiento.
   - **Descontar Dosis Usada (`- Usar Dosis`)**: resta la cantidad utilizada y registra el movimiento en el historial.
   - **Reponer Stock (`+ Reponer`)**: suma unidades/ml y actualiza la fecha de vencimiento cuando comprás una caja nueva.
   - **Dar de Baja el Producto Completo**: permite dar de baja total indicando si **se venció**, **lo tiré**, **lo perdí** o **se terminó**.

3. **Consultorio Virtual con IA (`¿Qué puedo tomar / darle?`)**:
   - Consultas en lenguaje natural (ej. *"Me duele la espalda, de mi stock ¿qué puedo tomar?"* o *"El bebé no para de vomitar, ¿qué le doy?"*).
   - Separa estrictamente medicamentos de **Adultos** y **Pediátricos / Bebés**.
   - Te sugiere qué medicamentos tenés **disponibles y en fecha en tu stock** (con botón para descontar la dosis directamente desde el chat).
   - Te advierte si tenías un medicamento para ese malestar pero está **vencido o sin stock**.
   - Si no tenés nada en stock para tratar ese malestar, te lo indica claramente y te **sugiere medicamentos adicionales para comprar en la farmacia** junto con pautas de alarma.

4. **Productos de Primera Necesidad y Alertas por Email (`aeterzano@gmail.com`)**:
   - Incluye una lista predefinida y 100% editable de medicamentos esenciales (Paracetamol e Ibuprofeno Adulto y Pediátrico, Sales de Rehidratación Oral, Antiemético, Antialérgico, Digestivo/Antiespasmódico y Antiséptico).
   - Envía alertas por correo electrónico vía Gmail SMTP a `aeterzano@gmail.com` en los 4 escenarios:
     - ⏳ **Producto próximo a vencer** (umbral configurable, por defecto 30 días)
     - 🚨 **Producto vencido**
     - ⭐ **Producto de primera necesidad faltante**
     - 📦 **Producto sin stock**
   - Incluye chequeo automático en tiempo real ante bajas/consumos, cron diario programado (`08:30` y `19:00` hs Argentina) y botón de envío manual inmediato.

## Base de Datos en Supabase

- La aplicación ya está conectada al mismo proyecto de Supabase y de autenticación que **Gastos**.
- Funciona de inmediato persistiendo en el bucket `botiquin` de **Supabase Storage**, y además incluye el archivo [`supabase_schema.sql`](./supabase_schema.sql) por si deseás crear las tablas relacionales (`botiquin_medicamentos`, `botiquin_esenciales`, `botiquin_movimientos`, `botiquin_config`, `botiquin_alertas_log`) desde el SQL Editor de Supabase.
