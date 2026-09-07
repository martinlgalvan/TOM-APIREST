---
name: validate-tom-contract
description: Comparar y validar contratos HTTP entre TOM APIREST y TOM Front, incluyendo rutas, verbos, parametros, payloads, respuestas, errores, cookies, tokens y permisos. Usar al cambiar un endpoint, un servicio de frontend, autenticacion o al diagnosticar incompatibilidades entre ambos repositorios.
---

# Validar un contrato TOM

1. Identificar el servicio consumidor en `../TOM-front/src/services` y rastrear sus llamadas desde paginas o componentes.
2. Identificar en TOM API la ruta Express, el orden de middleware, el controlador y el servicio correspondientes.
3. Comparar exactamente verbo, path, nombres de parametros, query, headers, credenciales y serializacion del body.
4. Comparar status y forma JSON para exito, validacion, no autenticado, sin permiso y recurso inexistente.
5. Verificar el flujo de sesion: `auth-token`, cookie de refresh con credenciales y reintento centralizado de `apiFetch`.
6. Comprobar tipos y opcionalidad de cada campo consumido, con atencion a IDs MongoDB, fechas y campos `source_*`.
7. Clasificar diferencias como compatibles, incompatibles o ambiguas. No afirmar compatibilidad si solo se inspecciono uno de los repositorios.
8. Para cambios compatibles, agregar pruebas que congelen el contrato. Para cambios incompatibles, actualizar productor y consumidor en el mismo trabajo o documentar el bloqueo.
9. Entregar una tabla breve con elemento, expectativa del frontend, comportamiento de la API y resultado, seguida de pruebas ejecutadas.
