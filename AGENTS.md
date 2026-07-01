# Instrucciones para agentes

- Nunca restablezcas, borres ni sobrescribas datos que ya existan en la base de datos de producción al modificarla o ejecutar migraciones. Las migraciones deben ser aditivas y preservar todos los datos existentes. Antes de aplicar un cambio, comprueba que no incluya operaciones destructivas y crea un plan seguro de reversión.
- Implementa en español todo el contenido que se muestre a los usuarios en la plataforma. Esto incluye textos de la interfaz, mensajes, errores, correos, notificaciones y metadatos visibles.
