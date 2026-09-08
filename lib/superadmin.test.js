import { ObjectId } from 'mongodb';

import { isSuperAdminUser, isSuperAdmin, superAdminIds } from './authorization.js';

/* El permiso del panel interno es lo unico que separa a un entrenador
   cualquiera de poder editar las cuentas de los demas. Por eso se prueba el
   caso feliz y, sobre todo, todas las formas de quedar afuera. */

const jefe = new ObjectId();
const otro = new ObjectId();

const original = process.env.SUPERADMIN_IDS;

afterEach(() => {
  if (original === undefined) delete process.env.SUPERADMIN_IDS;
  else process.env.SUPERADMIN_IDS = original;
});

function respuestaFalsa() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

describe('quien es superadministrador', () => {
  test('lo es el id que figura en la variable de entorno', () => {
    process.env.SUPERADMIN_IDS = String(jefe);
    expect(isSuperAdminUser({ _id: jefe })).toBe(true);
  });

  test('no lo es ningun otro usuario, ni siquiera siendo admin', () => {
    process.env.SUPERADMIN_IDS = String(jefe);
    expect(isSuperAdminUser({ _id: otro, role: 'admin' })).toBe(false);
  });

  /* Sin configurar, nadie entra. Es preferible que el panel no ande a que
     quede abierto porque falto poner la variable. */
  test('sin la variable definida no hay superadministradores', () => {
    delete process.env.SUPERADMIN_IDS;
    expect(isSuperAdminUser({ _id: jefe })).toBe(false);
  });

  test('una variable vacia tampoco habilita a nadie', () => {
    process.env.SUPERADMIN_IDS = '   ';
    expect(isSuperAdminUser({ _id: jefe })).toBe(false);
    expect(superAdminIds()).toEqual([]);
  });

  test('acepta varios ids y tolera espacios de mas', () => {
    process.env.SUPERADMIN_IDS = ` ${jefe} , ${otro} `;
    expect(isSuperAdminUser({ _id: jefe })).toBe(true);
    expect(isSuperAdminUser({ _id: otro })).toBe(true);
  });

  test('compara por valor aunque el id venga como texto', () => {
    process.env.SUPERADMIN_IDS = String(jefe);
    expect(isSuperAdminUser({ _id: String(jefe) })).toBe(true);
  });

  test('no explota sin usuario', () => {
    process.env.SUPERADMIN_IDS = String(jefe);
    expect(isSuperAdminUser(undefined)).toBe(false);
    expect(isSuperAdminUser({})).toBe(false);
    expect(isSuperAdminUser({ _id: null })).toBe(false);
  });
});

describe('middleware del panel interno', () => {
  test('deja pasar al superadministrador', () => {
    process.env.SUPERADMIN_IDS = String(jefe);
    const res = respuestaFalsa();
    let siguio = false;

    isSuperAdmin({ user: { _id: jefe } }, res, () => { siguio = true; });

    expect(siguio).toBe(true);
    expect(res.statusCode).toBeNull();
  });

  /* 404 y no 403: un 403 le confirma a quien prueba que la ruta existe. */
  test('a cualquier otro le responde 404, no 403', () => {
    process.env.SUPERADMIN_IDS = String(jefe);
    const res = respuestaFalsa();
    let siguio = false;

    isSuperAdmin({ user: { _id: otro, role: 'admin' } }, res, () => { siguio = true; });

    expect(siguio).toBe(false);
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  test('sin sesion tampoco pasa', () => {
    process.env.SUPERADMIN_IDS = String(jefe);
    const res = respuestaFalsa();
    let siguio = false;

    isSuperAdmin({}, res, () => { siguio = true; });

    expect(siguio).toBe(false);
    expect(res.statusCode).toBe(404);
  });
});
