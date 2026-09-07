import { jest } from '@jest/globals';

/* El PUT de ejercicios escribe el cuerpo tal cual sobre routine.$[day].exercises,
   que es un arreglo. Un cuerpo con otra forma dejaba el dia deformado, y a partir
   de ahi cualquier lectura o clonado de esa semana fallaba y podia tumbar el
   proceso. Estas pruebas fijan que se corte antes de tocar la base. */

const editExercise = jest.fn();

jest.unstable_mockModule('../services/routine.services.js', () => ({
  editExercise,
  /* El controlador importa el modulo entero; el resto no se usa en estas pruebas. */
}));

const { editById } = await import('./routine.api.controllers.js');

function respuestaFalsa() {
  const res = {
    codigo: null,
    cuerpo: null,
    status(c) { this.codigo = c; return this; },
    json(b) { this.cuerpo = b; return this; },
  };
  return res;
}

const pedido = (body) => ({ params: { week_id: 'w1', day_id: 'd1' }, body });

describe('editById: solo acepta un arreglo de ejercicios', () => {
  beforeEach(() => {
    editExercise.mockReset();
    editExercise.mockResolvedValue({ modifiedCount: 1 });
  });

  test('un arreglo se guarda', async () => {
    const res = respuestaFalsa();
    await editById(pedido([{ name: 'Sentadilla', sets: 3 }]), res);
    await new Promise((r) => setImmediate(r));

    expect(editExercise).toHaveBeenCalledTimes(1);
    expect(editExercise).toHaveBeenCalledWith('w1', 'd1', [{ name: 'Sentadilla', sets: 3 }]);
    expect(res.codigo).toBe(200);
  });

  test('un arreglo vacio tambien: es como se borra el ultimo ejercicio', async () => {
    const res = respuestaFalsa();
    await editById(pedido([]), res);
    await new Promise((r) => setImmediate(r));

    expect(editExercise).toHaveBeenCalledWith('w1', 'd1', []);
    expect(res.codigo).toBe(200);
  });

  test('un objeto se rechaza con 400 y no llega a la base', async () => {
    const res = respuestaFalsa();
    await editById(pedido({ exercises: [{ name: 'Sentadilla' }] }), res);

    expect(editExercise).not.toHaveBeenCalled();
    expect(res.codigo).toBe(400);
  });

  for (const [etiqueta, cuerpo] of [
    ['una cadena', 'sentadilla'],
    ['un numero', 7],
    ['null', null],
    ['sin cuerpo', undefined],
  ]) {
    test(`${etiqueta} se rechaza con 400 y no llega a la base`, async () => {
      const res = respuestaFalsa();
      await editById(pedido(cuerpo), res);

      expect(editExercise).not.toHaveBeenCalled();
      expect(res.codigo).toBe(400);
    });
  }

  test('si el servicio falla, responde 500 en vez de dejar la promesa sin manejar', async () => {
    editExercise.mockRejectedValue(new Error('mongo caido'));
    const res = respuestaFalsa();
    await editById(pedido([{ name: 'Sentadilla' }]), res);
    await new Promise((r) => setImmediate(r));

    expect(res.codigo).toBe(500);
  });
});
