import { getJwtSecret } from './authSession.js';

/* Antes, si faltaba JWT_SECRET, la aplicacion seguia andando con un valor
   escrito en el codigo de un repositorio publico: cualquiera podia firmar un
   token valido para cualquier usuario. Ahora tiene que negarse a operar. */

const original = process.env.JWT_SECRET;

afterEach(() => {
  if (original === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = original;
});

describe('el secreto de los tokens', () => {
  test('devuelve el valor cargado', () => {
    process.env.JWT_SECRET = 'un-secreto-suficientemente-largo-para-produccion';
    expect(getJwtSecret()).toBe('un-secreto-suficientemente-largo-para-produccion');
  });

  test('falla si la variable no esta', () => {
    delete process.env.JWT_SECRET;
    expect(() => getJwtSecret()).toThrow(/Falta JWT_SECRET/);
  });

  test('falla si la variable esta vacia o solo tiene espacios', () => {
    process.env.JWT_SECRET = '   ';
    expect(() => getJwtSecret()).toThrow(/Falta JWT_SECRET/);
  });

  /* Un secreto corto avisa pero no corta: cortar dejaria produccion afuera de
     golpe si alguien tiene uno corto cargado hoy. */
  test('un secreto corto sigue funcionando, pero deja aviso', () => {
    const avisos = [];
    const original = console.warn;
    console.warn = (m) => avisos.push(m);

    process.env.JWT_SECRET = 'corto';
    expect(getJwtSecret()).toBe('corto');

    console.warn = original;
    expect(avisos.some((a) => /caracteres/.test(a))).toBe(true);
  });
});
