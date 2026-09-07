---
name: implement-tom-endpoint
description: Crear o modificar endpoints de TOM APIREST en Express, incluyendo rutas, middleware, validacion, controladores, servicios MongoDB, autenticacion y autorizacion. Usar para cambios HTTP del backend; no usar para modificar solamente TOM Front ni para una auditoria sin implementacion.
---

# Implementar un endpoint de TOM API

1. Leer `AGENTS.md` y buscar endpoints equivalentes antes de definir el contrato.
2. Especificar verbo, path, parametros, body, respuesta, errores, autenticacion y roles. Revisar consumidores en `../TOM-front/src/services`.
3. Registrar la ruta en `api/routes` y mantener el controlador limitado a traducir HTTP, invocar servicios y responder.
4. Colocar consultas MongoDB y reglas reutilizables en `services`; reutilizar conexiones y conversiones de `ObjectId` existentes.
5. Aplicar validacion antes del controlador. Ejecutar `isLogin` antes de `isAdmin` o de cualquier middleware que use `req.user`.
6. Aplicar acceso `self` o `admin` cuando el recurso pertenezca a un usuario. No aceptar un identificador del cliente como prueba de identidad.
7. Responder JSON con status explicitos y conservar el esquema de errores de endpoints cercanos.
8. Agregar pruebas de exito, validacion, autenticacion, autorizacion y recurso inexistente segun corresponda.
9. Ejecutar la suite relevante y luego la suite completa cuando el alcance sea transversal.
10. Revisar el contrato con `$validate-tom-contract` y entregar cambios, pruebas y decisiones de compatibilidad.
