/**
 * Borra rutinas huerfanas: semanas cuyo alumno ya no existe.
 *
 * Hasta ahora dar de baja a un alumno borraba solo su usuario y dejaba sus
 * semanas en la coleccion. Nadie podia verlas ni borrarlas desde la aplicacion,
 * y se acumularon durante anios. `remove()` ya no las deja, pero lo viejo sigue
 * ahi: esto limpia ese arrastre.
 *
 * POR DEFECTO NO BORRA NADA. Sin --borrar solo informa que haria.
 *
 *   node scripts/limpiar-rutinas-huerfanas.mjs
 *   node scripts/limpiar-rutinas-huerfanas.mjs --hasta=2026-03-01
 *   node scripts/limpiar-rutinas-huerfanas.mjs --hasta=2026-03-01 --borrar
 *
 * Con --borrar, antes de tocar la base guarda una copia completa de todo lo que
 * va a borrar en un archivo .json. Si esa copia no se puede escribir, no borra.
 *
 * Reglas, todas conservadoras:
 *   - Solo entra una rutina si su user_id NO corresponde a ningun usuario.
 *   - Solo entra si su fecha es anterior al corte.
 *   - Si no se le puede determinar la fecha, NO se toca y se informa aparte.
 */

import fs from 'node:fs';
import path from 'node:path';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

/* ---------- argumentos ---------- */
const args = process.argv.slice(2);
const BORRAR = args.includes('--borrar');
const CORTE_TEXTO = (args.find((a) => a.startsWith('--hasta=')) || '--hasta=2026-03-01').split('=')[1];

const CORTE = new Date(`${CORTE_TEXTO}T00:00:00.000Z`);
if (Number.isNaN(CORTE.getTime())) {
  console.error(`Fecha de corte invalida: "${CORTE_TEXTO}". Se espera AAAA-MM-DD.`);
  process.exit(1);
}

/* ---------- fecha de una rutina ----------
   Se prueban tres fuentes, de mas a menos confiable. Validado contra la base:
   sobre 2000 documentos con timestamp y texto, 1999 coinciden en UTC.
   El texto viene como { fecha: "DD/MM/AAAA", hora: "..." }. */
function fechaDeRutina(r) {
  if (typeof r.timestamp === 'number' && Number.isFinite(r.timestamp)) {
    const d = new Date(r.timestamp);
    if (!Number.isNaN(d.getTime())) return { fecha: d, origen: 'timestamp' };
  }

  const texto = r?.created_at?.fecha;
  if (typeof texto === 'string') {
    const partes = texto.split('/').map(Number);
    if (partes.length === 3 && partes.every(Number.isFinite)) {
      const [dia, mes, anio] = partes;
      const d = new Date(Date.UTC(anio, mes - 1, dia));
      if (!Number.isNaN(d.getTime())) return { fecha: d, origen: 'created_at' };
    }
  }

  /* El _id de Mongo lleva adentro el momento en que se creo el documento. */
  if (r._id instanceof ObjectId) {
    const d = r._id.getTimestamp();
    if (d && !Number.isNaN(d.getTime())) return { fecha: d, origen: '_id' };
  }

  return { fecha: null, origen: 'sin fecha' };
}

/* ---------- recorrido ---------- */
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('Falta MONGODB_URI. Copiala de .env.example a .env.');
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();

try {
  const db = client.db('TOM');
  const rutinas = db.collection('Routine');
  const usuarios = db.collection('Users');

  const totalRutinas = await rutinas.countDocuments({});

  /* Quienes son duenos de alguna rutina y cuales de ellos ya no existen */
  const duenos = (await rutinas.distinct('user_id')).filter(Boolean);
  const vivos = new Set(
    (await usuarios.find({ _id: { $in: duenos } }).project({ _id: 1 }).toArray())
      .map((u) => String(u._id))
  );
  const inexistentes = duenos.filter((d) => !vivos.has(String(d)));

  console.log('================ rutinas huerfanas ================');
  console.log(`rutinas en la base:                 ${totalRutinas}`);
  console.log(`alumnos con rutinas:                ${duenos.length}`);
  console.log(`alumnos que ya no existen:          ${inexistentes.length}`);
  console.log(`corte:                              anteriores a ${CORTE.toISOString().slice(0, 10)}`);
  console.log('');

  if (!inexistentes.length) {
    console.log('No hay rutinas huerfanas. Nada que hacer.');
    process.exit(0);
  }

  const huerfanas = await rutinas.find({ user_id: { $in: inexistentes } }).toArray();

  const aBorrar = [];
  const seQuedan = [];
  const sinFecha = [];
  const porAnio = new Map();
  const porOrigen = new Map();

  for (const r of huerfanas) {
    const { fecha, origen } = fechaDeRutina(r);

    if (!fecha) {
      sinFecha.push(r);
      continue;
    }

    porOrigen.set(origen, (porOrigen.get(origen) || 0) + 1);
    const anio = fecha.getUTCFullYear();
    porAnio.set(anio, (porAnio.get(anio) || 0) + 1);

    if (fecha < CORTE) aBorrar.push(r);
    else seQuedan.push(r);
  }

  console.log(`huerfanas en total:                 ${huerfanas.length}`);
  console.log(`  anteriores al corte (se borran):  ${aBorrar.length}`);
  console.log(`  posteriores al corte (se quedan): ${seQuedan.length}`);
  console.log(`  sin fecha (NO se tocan):          ${sinFecha.length}`);
  console.log('');

  console.log('reparto por anio:');
  for (const anio of [...porAnio.keys()].sort()) {
    console.log(`  ${anio}: ${String(porAnio.get(anio)).padStart(6)}`);
  }
  console.log('');
  console.log('de donde salio la fecha:');
  for (const [origen, n] of porOrigen) console.log(`  ${origen}: ${n}`);
  console.log('');

  if (!BORRAR) {
    console.log('--- SIMULACION: no se borro nada ---');
    console.log('Para borrar de verdad, repetir el comando agregando --borrar');
    process.exit(0);
  }

  if (!aBorrar.length) {
    console.log('No hay nada anterior al corte. Nada que borrar.');
    process.exit(0);
  }

  /* Copia de seguridad antes de tocar la base */
  const carpeta = path.resolve('respaldos');
  fs.mkdirSync(carpeta, { recursive: true });
  const marca = new Date().toISOString().replace(/[:.]/g, '-');
  const archivo = path.join(carpeta, `rutinas-huerfanas-${marca}.json`);

  fs.writeFileSync(archivo, JSON.stringify(aBorrar, null, 2));
  const guardadas = JSON.parse(fs.readFileSync(archivo, 'utf8'));

  if (!Array.isArray(guardadas) || guardadas.length !== aBorrar.length) {
    console.error('La copia de seguridad no quedo completa. No se borro nada.');
    process.exit(1);
  }
  console.log(`copia de seguridad: ${archivo}  (${guardadas.length} rutinas, ${(fs.statSync(archivo).size / 1048576).toFixed(1)} MB)`);

  /* Borrado por tandas, solo por _id de lo que ya se reviso */
  const ids = aBorrar.map((r) => r._id);
  let borradas = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const tanda = ids.slice(i, i + 500);
    const res = await rutinas.deleteMany({ _id: { $in: tanda } });
    borradas += res.deletedCount;
    console.log(`  borradas ${borradas} de ${ids.length}`);
  }

  const quedan = await rutinas.countDocuments({});
  console.log('');
  console.log(`borradas:              ${borradas}`);
  console.log(`rutinas en la base:    ${quedan}  (antes ${totalRutinas})`);
  console.log(`copia de seguridad en: ${archivo}`);
} finally {
  await client.close();
}
