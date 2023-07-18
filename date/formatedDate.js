export function getDate() {
  var fecha = new Date();
  
  var dia = fecha.getUTCDate();
  var mes = fecha.getUTCMonth() + 1; // Los meses comienzan en 0, por lo que se suma 1
  var año = fecha.getUTCFullYear();
  
  // Asegurarse de que el día y el mes tengan dos dígitos
  dia = dia.toString().padStart(2, '0');
  mes = mes.toString().padStart(2, '0');
  
  var hora = fecha.getUTCHours() - 3; // Restar 3 horas para obtener la hora en GMT-3
  
  // Asegurarse de que la hora esté dentro del rango de 0 a 23
  hora = hora < 0 ? 24 + hora : hora;
  
  var minutos = fecha.getUTCMinutes().toString().padStart(2, '0');
  var segundos = fecha.getUTCSeconds().toString().padStart(2, '0');
  
  var horaFormateada = hora + ':' + minutos + ':' + segundos;

  var indicacionHorario = hora < 12 ? 'AM' : 'PM';
  
  var fechaFormateada = {
    fecha: dia + '/' + mes + '/' + año,
    hora: horaFormateada + ' ' + indicacionHorario
  };
  
  return fechaFormateada;
}

