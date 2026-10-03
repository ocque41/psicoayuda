# Instrucciones para agentes

- Nunca restablezcas, borres ni sobrescribas datos que ya existan en la base de datos de producción al modificarla o ejecutar migraciones. Las migraciones deben ser aditivas y preservar todos los datos existentes. Antes de aplicar un cambio, comprueba que no incluya operaciones destructivas y crea un plan seguro de reversión.
- Implementa en español todo el contenido que se muestre a los usuarios en la plataforma. Esto incluye textos de la interfaz, mensajes, errores, correos, notificaciones y metadatos visibles.

## Contexto del producto Nido

- Antes de ampliar el CRM, orientación, pagos o flujo profesional, lee `docs/producto/README.md` y el documento de arquitectura/operación correspondiente. Distingue comportamiento implementado de condiciones pendientes de proveedores y responsables.
- Mantén separados el software profesional, los pagos de atención y Ayuda Terremoto. El programa gratuito no admite cobros ni contratación condicionada.
- No incluyas datos identificables ni relatos de pacientes reales en fixtures, documentación, capturas o commits. Usa ejemplos ficticios. No publiques datos societarios o direcciones privadas en marketing.
- No presentes una clasificación como diagnóstico o garantía de seguridad. El orientador local no debe enviar narrativas a terceros ni generar scores de riesgo clínico.
- Prueba cambios de BD en una base temporal; evita suites con datos ficticios contra producción. Mantén las invariantes de aislamiento, cupos, conflictos y créditos dentro de escrituras atómicas.
