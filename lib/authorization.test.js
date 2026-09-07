import { ObjectId } from 'mongodb';

import { coachCanManageStudent } from './authorization.js';

const coachId = new ObjectId();
const otherCoachId = new ObjectId();

const coach = { _id: coachId, role: 'admin' };
const otherCoach = { _id: otherCoachId, role: 'admin' };

function student(entrenadorId, extra = {}) {
  return { _id: new ObjectId(), role: 'common', entrenador_id: entrenadorId, ...extra };
}

describe('coachCanManageStudent', () => {
  test('un entrenador puede administrar a su propio alumno', () => {
    expect(coachCanManageStudent(coach, student(coachId))).toBe(true);
  });

  test('un entrenador NO puede administrar al alumno de otro entrenador', () => {
    expect(coachCanManageStudent(coach, student(otherCoachId))).toBe(false);
  });

  test('un entrenador NO puede administrar a otro entrenador', () => {
    expect(coachCanManageStudent(coach, otherCoach)).toBe(false);
  });

  test('cualquier usuario puede operar sobre si mismo', () => {
    expect(coachCanManageStudent(coach, coach)).toBe(true);

    const alumno = student(coachId);
    expect(coachCanManageStudent(alumno, alumno)).toBe(true);
  });

  test('un alumno NO puede administrar a otro alumno del mismo entrenador', () => {
    const alumnoA = student(coachId);
    const alumnoB = student(coachId);
    expect(coachCanManageStudent(alumnoA, alumnoB)).toBe(false);
  });

  test('compara ids por valor aunque uno venga como string', () => {
    const alumno = student(coachId.toString());
    expect(coachCanManageStudent(coach, alumno)).toBe(true);

    const coachConIdString = { _id: coachId.toString(), role: 'admin' };
    expect(coachCanManageStudent(coachConIdString, student(coachId))).toBe(true);
  });

  test('un alumno sin entrenador asignado no es administrable', () => {
    expect(coachCanManageStudent(coach, student(null))).toBe(false);
    expect(coachCanManageStudent(coach, student(undefined))).toBe(false);
  });

  test('no explota con argumentos faltantes', () => {
    expect(coachCanManageStudent(null, student(coachId))).toBe(false);
    expect(coachCanManageStudent(coach, null)).toBe(false);
    expect(coachCanManageStudent(undefined, undefined)).toBe(false);
    expect(coachCanManageStudent({ role: 'admin' }, student(coachId))).toBe(false);
  });
});
