# Guia de Colaboradores externos para comerciales

Esta guia te explica como funciona la gestion de **colaboradores externos** en Urus: bancos, abogados, tasadores, arquitectos, inversores y proveedores que participan en tus operaciones.

Tiempo de lectura: menos de 5 minutos.

---

## Terminos que vas a leer aqui

- **Urus**: la plataforma web que estas usando (el panel donde gestionas tus ventas, tus clientes y tus operaciones).
- **Inmovilla**: el programa de gestion inmobiliaria de la empresa. Inmovilla no tiene nada de colaboradores; este modulo vive solo en Urus.
- **Colaborador externo**: cualquier persona o entidad que interviene en una operacion pero que no pertenece al equipo comercial. Ejemplos: banco (hipotecas), abogado (revision de contratos), tasador (valoracion del inmueble), arquitecto (informes tecnicos), inversor, proveedor.
- **Hito**: cada paso clave en el trabajo del colaborador. Por ejemplo, para un banco: "documentacion enviada", "estudio iniciado", "preaprobacion", "aprobacion final". Cada hito tiene una fecha de registro.
- **Tiempo de respuesta esperado**: el plazo razonable que tiene un colaborador para completar un hito. Si lo supera, salta una alerta.
- **Operacion**: el expediente de venta en curso al que esta vinculado el colaborador.

---

## Que hace el sistema por ti

Tu registras al colaborador y vas marcando los hitos a medida que ocurren. A partir de ahi, Urus se encarga del resto:

1. **Registra cada colaborador con sus datos.** Tipo (banco, abogado, tasador, arquitecto, inversor, proveedor), ciudad, especialidad y tiempos de respuesta esperados. Todo queda en una ficha unica.

2. **Define hitos estandar por tipo de colaborador.** Cada tipo tiene una secuencia de pasos predefinida:
   - **Banco**: documentacion enviada → estudio iniciado → preaprobacion → aprobacion final.
   - **Abogado**: revision de contrato → observaciones enviadas → validacion final.
   - **Tasador**: visita programada → visita realizada → informe entregado.
   - **Arquitecto**: solicitud de informe → visita tecnica → informe entregado.

3. **Marca tiempos automaticamente.** Cada vez que avanzas un hito, el sistema registra la fecha y la hora. No tienes que apuntar nada aparte.

4. **Calcula retrasos en tiempo real.** Si un colaborador lleva mas dias de los esperados sin avanzar, el sistema lo detecta solo. No tienes que estar pendiente de contar dias.

5. **Te avisa cuando algo se retrasa.** Si el colaborador supera su tiempo de respuesta esperado, recibes una alerta. No tienes que revisar uno por uno.

6. **Avisa a direccion si el problema es recurrente.** Si un colaborador se retrasa repetidamente en varias operaciones, el sistema genera una alerta para el responsable o la direccion. Asi se pueden tomar decisiones (reducir asignaciones, cambiar de colaborador, etc.).

7. **Genera metricas automaticas.** Sin que hagas nada extra, el sistema calcula:
   - Tiempo medio de respuesta por colaborador.
   - Tiempo medio de resolucion (de inicio a fin de su trabajo).
   - Porcentaje de operaciones desbloqueadas a tiempo.
   - Porcentaje de operaciones bloqueadas por el colaborador.
   - Impacto en el tiempo de cierre de la operacion.
   - Ratio de retrabajo (cuantas veces hay que volver atras con ese colaborador).

---

## Que tienes que hacer tu

### 1. Asigna el colaborador a la operacion

Cuando una operacion necesita la intervencion de un externo (banco para la hipoteca, abogado para el contrato, tasador para la valoracion...), entra en la operacion y asigna al colaborador correspondiente.

Si el colaborador ya existe en el sistema, lo seleccionas. Si es nuevo, lo das de alta con sus datos (nombre, tipo, ciudad, especialidad, tiempos de respuesta esperados).

### 2. Sube documentos en su nombre

Los colaboradores no acceden a Urus. Si el banco te envia la preaprobacion por correo, o el abogado te manda las observaciones por correo, tu subes esos documentos dentro de la operacion. Asi queda todo registrado y visible para el equipo.

### 3. Avanza los hitos cuando ocurran

Cuando el banco inicia el estudio, lo marcas. Cuando el abogado envia observaciones, lo marcas. Cuando el tasador entrega el informe, lo marcas.

Es un clic por hito. El sistema registra la fecha automaticamente.

### 4. Actua sobre las alertas

Si recibes una alerta de retraso, contacta al colaborador. Si el bloqueo persiste, escala internamente. El sistema te da la informacion; tu decides como actuar.

---

## Que ves en pantalla

Dentro de cada operacion que tiene colaboradores asignados, ves:

- **Quien esta asignado**: nombre del colaborador, tipo y especialidad.
- **En que hito va**: el paso actual dentro de la secuencia de hitos de ese tipo de colaborador.
- **Dias transcurridos**: cuanto tiempo lleva en el hito actual.
- **Estado**: si esta dentro del plazo esperado o si ya se ha retrasado.
- **Historial de hitos**: todos los pasos anteriores con sus fechas.

Si el colaborador esta retrasado, lo ves destacado. Tambien ves cuantos dias lleva de retraso exacto.

En la vista general de operaciones, puedes filtrar para ver cuales tienen colaboradores bloqueados y cuales avanzan con normalidad.

---

## Relacion con Inmovilla

Inmovilla no tiene ningun concepto de colaborador externo. No hay entidad, campo ni seccion en Inmovilla para gestionar bancos, abogados, tasadores ni arquitectos.

Este modulo vive al 100 % en Urus. No hay sincronizacion, no hay datos que ir ni que venir. Todo lo que registras aqui se queda en Urus.

---

## Preguntas frecuentes

### "Los colaboradores entran a Urus?"

No. Los colaboradores no tienen acceso a Urus. Tu gestionas todo por ellos: subes sus documentos, avanzas sus hitos, registras su progreso. Ellos no ven nada del sistema.

### "Quien gestiona los colaboradores?"

Tu como comercial para tus operaciones. La direccion puede ver las metricas globales y tomar decisiones (por ejemplo, dejar de trabajar con un banco que siempre se retrasa).

### "Que pasa si un banco es siempre lento?"

El sistema lo detecta. Las metricas muestran su tiempo medio, su ratio de retraso y cuantas operaciones ha bloqueado. Con esos datos, la direccion puede decidir reducir las asignaciones a ese banco o cambiar de entidad.

### "Tengo que actualizar los hitos a mano?"

Si. Cuando algo pasa (el banco empieza el estudio, el abogado envia observaciones, el tasador entrega el informe), tu lo marcas en Urus. Es un clic por hito. El sistema registra la fecha y calcula los plazos automaticamente.

### "Puedo ver que colaborador esta bloqueando mi operacion?"

Si. Dentro de la operacion ves exactamente que colaborador esta retrasado, en que hito se quedo y cuantos dias lleva de retraso.

### "Y si un colaborador interviene en varias operaciones?"

Cada asignacion es independiente. El sistema lleva la cuenta por operacion, pero tambien agrega las metricas del colaborador en todas sus operaciones para dar una vision global de su rendimiento.

### "Esto afecta a Inmovilla de alguna forma?"

No. Inmovilla no sabe nada de colaboradores. Este modulo es exclusivo de Urus. No hay nada que sincronizar ni que tocar en Inmovilla.

---

## Buenas practicas

- **Asigna al colaborador en cuanto lo necesites.** No esperes a que el banco conteste para registrarlo. Asignalo cuando envies la documentacion, asi el reloj empieza a contar desde el primer momento.
- **Avanza los hitos el mismo dia que ocurren.** Si el abogado te manda las observaciones el martes, marcalo el martes. Asi los tiempos reflejan la realidad.
- **Sube los documentos que te envien.** Aunque los tengas en el correo, subirlos a la operacion garantiza que el equipo los ve y que quedan asociados al expediente correcto.
- **No ignores las alertas de retraso.** Una alerta significa que el colaborador ya supero su plazo esperado. Contactalo. Si no responde, escala.
- **Revisa las metricas antes de elegir colaborador.** Si tienes que elegir entre dos bancos o dos abogados, mira sus tiempos medios y su ratio de bloqueo. Elige al que mejor rendimiento tiene.
- **Mantén los datos del colaborador actualizados.** Si un abogado cambia de despacho o un banco cambia de contacto, actualiza la ficha. Asi el equipo siempre tiene la informacion correcta.
