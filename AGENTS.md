# TOM APIREST

## Entorno

- Usar Node.js 22 y el package manager del lockfile vigente; no actualizar dependencias salvo necesidad de la tarea.
- Ejecutar la API local con `npm run dev`/`pnpm dev` y las pruebas con `npm test`/`pnpm test`.
- Tratar `TOM-front`, ubicado como repositorio hermano, como consumidor principal del contrato HTTP.

## Arquitectura

- Definir rutas en `api/routes`, orquestacion HTTP en `api/controllers` y acceso a datos/reglas reutilizables en `services`.
- Aplicar autenticacion y autorizacion desde `api/middleware`; `isAdmin` requiere que `isLogin` se ejecute antes.
- Validar entradas antes del controlador. Mantener respuestas JSON y codigos HTTP coherentes con endpoints relacionados.
- Usar `MONGODB_URI` y las utilidades de conexion existentes; no hardcodear credenciales ni conexiones.
- Preservar identificadores MongoDB y campos de trazabilidad `source_*` al clonar o proyectar rutinas.

## Seguridad y contratos

- Proteger en servidor cada operacion privada; nunca depender de controles ocultos en el frontend.
- Comprobar acceso `self` o `admin` en recursos asociados a un usuario.
- No registrar tokens, cookies, secretos ni datos personales completos.
- Considerar incompatible cualquier cambio de ruta, verbo, status, campo, tipo o semantica consumida por TOM Front.
- Coordinar cambios incompatibles con los servicios de `../TOM-front/src/services` y agregar pruebas de ambos lados.

## Verificacion

- Agregar pruebas Jest para rutas, middleware o servicios modificados. Usar `mongodb-memory-server` cuando se necesite persistencia aislada.
- Probar al menos exito, entrada invalida, no autenticado y sin permiso cuando corresponda.
- Ejecutar la suite relevante y, antes de finalizar cambios amplios, `npm test` o `pnpm test`.
- No depender de bases de produccion ni servicios externos en pruebas automatizadas.
- Preservar cambios locales existentes e informar comandos, resultados y validaciones omitidas.
