# Guia de Operaciones para comerciales

Esta guia te explica, en lenguaje del dia a dia, como funciona la seccion de **Operaciones** de Urus y que hace el sistema por ti cuando trabajas con un cliente.

No hace falta saber nada tecnico. Si ves una palabra rara, esta explicada la primera vez que aparece.

---

## Terminos que vas a leer aqui

- **Urus**: la plataforma web que estas usando ahora mismo (el panel donde gestionas tus ventas).
- **Inmovilla**: el programa de gestion inmobiliaria de la empresa, donde estan registradas las propiedades, los clientes y las demandas. Antes entrabas ahi a cerrar manualmente; ahora Urus lo hace por ti.
- **Operacion**: el expediente que representa una venta concreta (una propiedad con un posible comprador). Es como "la carpeta" de esa venta.
- **Propiedad**: el inmueble que estas gestionando.
- **Demanda**: la busqueda activa de un cliente (lo que el cliente quiere comprar o alquilar, con sus filtros).
- **Comprador / cliente**: la persona interesada en la propiedad.
- **Estado**: la fase en la que esta la operacion (en negociacion, con oferta firme, cerrada, etc.).
- **Contrato**: documento legal (oferta en firme, reserva, arras).
- **Posventa**: seguimiento automatico del cliente despues de firmar (mensajes de agradecimiento, encuestas, recordatorios, etc.). Lo gestiona Urus solo, tu no tienes que hacer nada manual para que arranque.

---

## 1. Que es una operacion

Una **operacion** es el registro dentro de Urus que representa una venta en curso. Es el "expediente" con el que vas a trabajar desde que el cliente se interesa en serio por una propiedad hasta que firmais (o hasta que decides cancelar).

Dentro de una operacion tienes, en un solo sitio:

- la propiedad,
- el cliente o comprador (si lo has asociado),
- la demanda vinculada (si la hay),
- los contratos (oferta, reserva, arras),
- tus notas internas,
- una lista de tareas pendientes,
- los documentos que subas,
- el historial completo de lo que ha ido pasando.

### Por que existe Operaciones

Antes el cierre se gestionaba manualmente en varios sitios (Inmovilla, hojas de calculo, WhatsApp, carpetas compartidas). Ahora solo tocas Urus y el sistema se encarga de actualizar Inmovilla, generar los contratos y arrancar los mensajes de posventa.

---

## 2. Como crear una operacion

1. Abre la seccion **Operaciones** en el menu lateral.
2. Pulsa el boton **Nueva**.
3. Elige la propiedad (y si quieres, asocia ya la demanda del cliente).
4. Confirma.

### Que pasa cuando la creas

- La operacion queda en estado **En curso** (acabas de abrirla, no has hecho oferta todavia).
- Queda registrado quien la creo y cuando.
- A partir de ese momento, toda la informacion de la venta vive dentro de la operacion.

### Regla importante

Una propiedad solo puede tener **una operacion activa a la vez**. Si ya hay una abierta para esa propiedad, el sistema no te dejara crear otra. Primero hay que cerrar o cancelar la actual.

---

## 3. Que significa cada estado

Los estados indican en que momento de la venta estas. Los dividimos en dos grupos: los que indican que la operacion **sigue viva** y los que indican que **ya ha terminado** (bien cerrada, bien cancelada).

### Estados activos (la operacion sigue viva)

Estos son los pasos naturales de una venta:

1. **En curso**: acabas de abrir la operacion. Todavia no hay oferta formal.
2. **Oferta firme**: el comprador ha hecho una oferta en firme por la propiedad.
3. **Reserva**: se ha formalizado una reserva o senal de compra (el comprador ha entregado una cantidad inicial).
4. **Arras**: se ha firmado el contrato de arras (pago mas grande, compromiso mas fuerte).
5. **Pendiente de firma**: solo falta firmar la escritura o contrato final. La operacion esta a punto de cerrarse.

### Estados finales (la operacion ha terminado)

- **Cerrada (venta)**: la propiedad se vendio.
- **Cerrada (alquiler)**: la propiedad se alquilo.
- **Cerrada (traspaso)**: se hizo un traspaso.
- **Cancelada**: la operacion se cayo y no se va a cerrar.

### Que cambia cuando una operacion llega a un estado final

- **Si la operacion se cierra** (venta, alquiler o traspaso):
  - Ya no se puede seguir avanzando.
  - Urus actualiza automaticamente la propiedad en Inmovilla para marcarla como vendida, alquilada o traspasada. Tu no tienes que entrar a Inmovilla a hacerlo.
  - Si la operacion tenia una demanda asociada, Urus la da de baja en Inmovilla para que no siga recibiendo cruces.
  - Urus arranca los mensajes automaticos al cliente (posventa): agradecimiento, encuesta, recordatorios, etc.
- **Si la operacion se cancela**:
  - Queda como "no cerrada" y ya no se puede avanzar.
  - No se hacen cambios en Inmovilla ni se envian mensajes de posventa, porque no hubo venta.

---

## 4. Avanzar de estado (normal o saltando etapas)

Cuando la operacion progresa, tu le dices al sistema en que fase esta. Eso se hace desde el boton **Avanzar** de la operacion.

### Avance normal

Pasas al siguiente estado del flujo (por ejemplo, de **En curso** a **Oferta firme**). Es lo habitual.

### Saltar etapas (avance forzado)

A veces una venta avanza muy rapido y saltas fases (por ejemplo, pasas directamente de **En curso** a **Arras** sin registrar una **Reserva** previa). Esto se permite, pero siempre **hacia adelante**.

### Reglas que siempre se cumplen

- Solo puedes **avanzar hacia estados posteriores**. Nunca puedes volver atras.
- No puedes avanzar una operacion que ya este **cerrada** o **cancelada**.
- Si el estado destino necesita un contrato (por ejemplo, **Oferta firme**, **Reserva** o **Arras**), el sistema comprobara que tiene los datos minimos. Si le faltan datos, te los pedira antes de dejarte avanzar.

### Que son los "datos minimos"

Son los datos sin los cuales no se puede generar el contrato correctamente. Por ejemplo: nombre y DNI del comprador, direccion del inmueble, precio ofertado, importe de la senal, IBAN, etc. Si falta alguno, el sistema te avisa, te lo pide en pantalla y cuando lo rellenas puedes seguir avanzando sin salir del flujo.

---

## 5. Contratos automaticos

Cuando avanzas a ciertos estados, Urus genera automaticamente un **borrador del contrato** correspondiente:

- Avanzas a **Oferta firme** → se genera el borrador de oferta en firme.
- Avanzas a **Reserva** → se genera el borrador de reserva (senal de compra).
- Avanzas a **Arras** → se genera el borrador de arras.

### Puntos importantes

- Si ya existe un contrato de ese tipo para esa operacion, **no se duplica**. El sistema no te va a crear dos veces la misma oferta.
- Si al intentar generarlo faltan datos, te avisa y te pide los campos que falten.
- Una vez completos, puedes reintentar desde el mismo sitio sin volver a empezar.

---

## 6. Cerrar una operacion

Cuando la operacion termina bien (se firma), la abres y pulsas **Cerrar**. Eliges si fue venta, alquiler o traspaso.

### Que hace Urus por ti al cerrar

1. Guarda la fecha y el tipo de cierre en la operacion.
2. Deja registrado en el historial que se cerro.
3. Marca la demanda del cliente como "cerrada" internamente (ya no sigue en la cartera activa).
4. **Actualiza la propiedad en Inmovilla** para reflejar que se vendio, alquilo o traspaso.
5. Si hay demanda asociada, **la da de baja en Inmovilla** para que ese cliente no siga recibiendo cruces de una demanda ya cerrada.
6. **Arranca los mensajes de posventa**: agradecimiento, encuesta, recordatorios, etc.

### Dicho en plano: que hace esto por ti como comercial

- No tienes que entrar a Inmovilla a cambiar el estado de la propiedad. Urus lo hace.
- No tienes que dar de baja manualmente la demanda. Urus lo hace.
- No tienes que escribirle al cliente los mensajes de seguimiento despues de firmar. Urus lo hace.

---

## 7. Cancelar una operacion

Si la venta se cae, abres la operacion y pulsas **Cancelar**.

- La operacion queda como **Cancelada** y ya no se puede avanzar ni cerrar.
- **No se hacen cambios en Inmovilla** (no hubo venta) y **no se mandan mensajes de posventa** (no hay cliente que agradecer).
- Queda en el historial que tu la cancelaste, para que el equipo lo vea.

Importante: cancelar **no** es un atajo para cerrar. Si la venta se firmo, siempre usa **Cerrar** con el tipo correcto. Cancelar es solo cuando la operacion no va a cerrarse.

---

## 8. Relacion con Inmovilla (lo que Urus hace por ti)

Esta es la parte que mas dudas genera. Te lo dejo simple:

- Inmovilla es el programa donde viven los datos finales (propiedades, clientes, demandas).
- Antes, cerrar una operacion significaba entrar a Inmovilla a cambiar el estado de la propiedad y tocar la demanda del cliente. Ahora, **ese trabajo lo hace Urus por ti**.
- Cuando tu cierras una operacion en Urus:
  - Urus marca la propiedad en Inmovilla como vendida, alquilada o traspasada.
  - Si el cliente tenia demanda activa, Urus la pasa a "cerrada" en Inmovilla.
  - Si es posible, Urus vincula al comprador con la propiedad en Inmovilla.
- Todo esto pasa **en segundo plano**, sin bloquear tu pantalla. Tu sigues con el siguiente cliente.

### Que pasa si falta algo para actualizar la demanda

Si al cerrar el sistema no tiene datos suficientes para dar de baja la demanda en Inmovilla (por ejemplo, porque la demanda estaba incompleta), **la operacion se cierra igual** en Urus y queda constancia interna. El resto del cierre (propiedad y posventa) sigue adelante con normalidad.

---

## 9. Notas, lista de tareas y archivos dentro de la operacion

Cuando abres el detalle de una operacion, ves un panel con tres pestanas. Son tu "libreta" y tu "caja" de la venta:

### Notas internas

- Texto libre.
- Para dejar contexto de la operacion: "cliente pide bajar 5.000 €", "propietaria viaja el dia 10", "revisar cedula de habitabilidad", etc.
- Las ve el equipo (segun permisos). Quedan con tu nombre y la fecha.

### Lista de tareas

- Listado de tareas pendientes para esa operacion concreta.
- Puedes asignar cada tarea a un responsable.
- Puedes marcar como completada, reordenar, editar y eliminar.
- Util para no olvidar tramites previos a firma (nota simple, cedula, cambio de titular, etc.).

### Archivos adjuntos

- Subes documentos vinculados a la operacion (PDF, fotos, justificantes, etc.).
- Formatos admitidos: PDF, Word, Excel, imagenes habituales.
- Hay un limite por archivo y un limite total por operacion (te lo avisa la pantalla).
- Cualquier compañero del equipo con acceso a la operacion puede verlos.

Todo esto vive **dentro de la operacion**, no en carpetas sueltas. Asi el equipo ve la venta completa sin tener que buscar nada por fuera.

---

## 10. Historial y trazabilidad

Cada accion importante se registra automaticamente:

- creacion de la operacion,
- cada avance de estado,
- cierre o cancelacion,
- generacion de contratos,
- notas, tareas y archivos añadidos.

Si un compañero o el responsable entra al detalle, puede ver "que ha pasado aqui" sin tener que preguntartelo.

---

## 11. Preguntas frecuentes

### "Si cierro en Urus, tengo que cerrar tambien en Inmovilla?"

No. Al cerrar en Urus, el sistema actualiza solo la propiedad en Inmovilla y da de baja la demanda si corresponde. No tienes que entrar a Inmovilla a tocar nada.

### "Puedo saltarme etapas?"

Si, hacia adelante. Si la venta va muy rapida y saltas de **En curso** a **Arras**, esta bien. Lo unico que no puedes hacer es volver atras, ni avanzar una operacion que ya este cerrada o cancelada.

### "Que hago si me falta un dato para el contrato?"

El sistema te avisa, te señala que campos faltan y te deja rellenarlos ahi mismo. Cuando los completes, pulsas reintentar y sigue el flujo.

### "Puedo cerrar sin comprador asociado?"

Si, el sistema te deja. Pero lo recomendable es tener al comprador asociado a la operacion, porque asi Urus puede vincularlo a la propiedad en Inmovilla y queda mucho mejor registrado.

### "Cancelar es lo mismo que cerrar?"

No. **Cerrar** es "hubo venta, alquiler o traspaso". **Cancelar** es "la operacion se cayo, no hubo firma". Usa cada uno segun corresponda; no uses cancelar como atajo.

### "Y si me he equivocado y he cancelado por error?"

Una vez cancelada, la operacion queda terminada. Si hay que retomar la venta, se crea una operacion nueva para esa propiedad (ya no hay otra activa bloqueando).

### "Donde veo todo lo que ha pasado con una operacion?"

En el detalle de la operacion. Ahi estan: estado, historial, contratos, notas, tareas y archivos.

---

## 12. Buenas practicas del dia a dia

- **Abre la operacion pronto**: en cuanto el cliente entra en negociacion formal, crea la operacion. Asi todo lo siguiente ya queda registrado.
- **Asocia la demanda y el comprador cuanto antes**: asi el cierre queda limpio en Inmovilla y el equipo ve a quien pertenece la venta.
- **Usa notas internas**: una operacion sin contexto es una operacion en riesgo. Una nota corta vale mas que una llamada despues.
- **Apoyate en la lista de tareas**: para no olvidar tramites (cedula, nota simple, ITE, cambio de suministros, etc.).
- **Sube los documentos clave al panel de archivos**: evita tenerlos solo en el movil o en el correo.
- **Cierra con el tipo correcto**: venta, alquiler o traspaso. No uses cancelar si realmente hubo firma.

---

## 13. Resumen en una frase

**Operaciones** es el sitio donde gestionas el cierre de tus ventas de principio a fin: creas la operacion, la vas avanzando segun progresa el cliente, el sistema genera los contratos automaticamente, y al cerrar actualiza Inmovilla y arranca el seguimiento posventa sin que tengas que tocar nada mas.