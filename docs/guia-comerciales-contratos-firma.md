# Guia de contratos automaticos, revision por voz y firma electronica para comerciales

Cuando una operacion avanza a las fases de reserva, arras o cierre, Urus genera automaticamente el contrato correspondiente, permite que el gestor lo revise por voz y lo envia a firma electronica sin salir de la plataforma. Esta guia te explica como funciona todo ese proceso y que papel tienes tu.

---

## Terminos que vas a leer aqui

- **Urus**: la plataforma web que estas usando (el panel donde gestionas tus ventas, tus clientes y tus operaciones).
- **Inmovilla**: el programa de gestion inmobiliaria de la empresa, donde estan registradas las propiedades, los clientes y las demandas.
- **Operacion**: el expediente dentro de Urus que representa una venta concreta (una propiedad con un comprador). Es la "carpeta" de esa venta.
- **Gestor (backoffice)**: la persona del equipo de administracion que revisa y valida los contratos antes de enviarlos a firma. No es el comercial; es quien se encarga de la parte documental y legal.
- **Borrador**: la primera version del contrato que genera el sistema automaticamente. Todavia no esta firmado ni aprobado. Es un documento preliminar que el gestor revisa.
- **Version**: cada vez que se modifica el contrato se guarda una version nueva con un numero correlativo (v1, v2, v3…). Ninguna version se pierde.
- **Firma electronica**: el proceso por el cual el firmante (comprador, vendedor o ambos) firma el contrato en su movil o su ordenador, sin papel. El sistema verifica su identidad y sella el documento.
- **Enlace de firma**: una direccion web unica que el sistema genera para cada firmante. Al abrirlo, el firmante puede revisar el documento y firmarlo.
- **Codigo de verificacion por SMS**: un codigo numerico de un solo uso que el firmante recibe en su movil por mensaje de texto. Sirve para confirmar que la persona que firma es realmente quien dice ser.
- **Sello de integridad**: un codigo tecnico que se incrusta en el documento firmado. Garantiza que nadie ha modificado el documento despues de la firma. Si alguien lo alterara, el sello dejaria de ser valido.
- **Pista de auditoria**: el registro interno que guarda quien firmo, cuando, desde que direccion de internet y con que codigo de verificacion. Es la prueba de que la firma se produjo de forma legitima.
- **Arras penitenciales**: contrato de arras en el que cualquiera de las dos partes puede echarse atras, pero perdiendo una cantidad pactada (el comprador pierde la senal; el vendedor devuelve el doble).
- **Arras confirmatorias**: contrato de arras en el que ninguna de las partes puede desistir libremente. Si una parte incumple, la otra puede exigir el cumplimiento o una indemnizacion por daños.
- **Condicion de hipoteca**: clausula que condiciona la compraventa a que el comprador obtenga financiacion bancaria en un plazo determinado. Si no la obtiene, el contrato puede resolverse.
- **Bloque condicional**: una seccion del contrato que el sistema incluye o excluye automaticamente segun las circunstancias de la operacion. Por ejemplo, si hay condicion de hipoteca, el sistema incluye esa clausula; si no la hay, la omite.

---

## Que hace el sistema por ti

### Generacion automatica del contrato

Cuando avanzas una operacion a **Reserva/Senal**, **Arras** o la fase de **cierre**, Urus genera automaticamente un borrador del contrato correspondiente. Tu no escribes ni una linea del documento. El sistema lo hace asi:

1. **Extrae los datos de la operacion.** Toda la informacion necesaria se recoge de lo que ya existe en Urus y en Inmovilla:
   - **Comprador**: nombre completo, DNI o NIE, direccion postal, telefono y correo.
   - **Vendedor**: nombre completo, DNI o NIE, direccion postal, telefono y correo.
   - **Propiedad**: direccion completa y referencia interna.
   - **Detalles de la operacion**: precio de venta, importe de la senal o arras, condiciones de pago, plazos.
   - **Agencia**: comercial asignado, honorarios y comision pactada.

2. **Comprueba que tiene todo.** El sistema necesita unos datos minimos para generar el contrato. Si falta algun campo (por ejemplo, el DNI del comprador o la direccion del vendedor), **no genera el contrato a medias**. En su lugar, crea una tarea asignada a ti para que completes los campos que faltan. Cuando los rellenes, el sistema reintenta la generacion automaticamente.

3. **Selecciona la plantilla correcta.** Segun la fase de la operacion (reserva, arras, cierre), el sistema elige el modelo de contrato adecuado.

4. **Rellena las variables y los bloques condicionales.** El contrato no se genera editando texto libre. El sistema introduce los valores en campos predefinidos (importes, plazos, honorarios, direcciones, DNIs, cuentas bancarias) y decide que bloques condicionales incluir segun la situacion:
   - Arras penitenciales o arras confirmatorias (segun lo que se haya pactado).
   - Condicion de hipoteca si o no.
   - Entrega de llaves en el momento de la firma o en una fecha posterior.
   - Mobiliario incluido (si hay mobiliario, se genera un anexo).

5. **Genera el borrador (version 1).** El resultado es un documento completo, listo para que el gestor lo revise. No es un esqueleto con huecos; es un contrato con todos los datos en su sitio.

### Revision por voz (la hace el gestor, no tu)

Una vez generado el borrador, el gestor del equipo de administracion lo revisa. En lugar de editar el documento manualmente, el gestor puede hablar directamente en Urus para pedir cambios. Funciona asi:

1. El gestor abre el borrador dentro de la operacion en Urus.
2. Habla en voz alta indicando los cambios que quiere. Por ejemplo:
   - "Cambia los honorarios a 3 % mas IVA."
   - "Quiero arras penitenciales."
   - "El plazo para ir a notaria son 45 dias."
3. El sistema transcribe lo que dice el gestor (convierte la voz en texto escrito) e interpreta las instrucciones.
4. Si hay alguna ambiguedad, el sistema pregunta antes de aplicar el cambio. Por ejemplo: "¿45 dias naturales o 45 dias habiles?"
5. El sistema aplica los cambios y genera una version nueva (v2, v3, etc.).
6. Muestra un resumen de que ha cambiado respecto a la version anterior.
7. El gestor revisa el resumen, y si todo esta bien, aprueba el contrato. A partir de ese momento, el documento esta listo para enviarse a firma.

**Tu como comercial no participas en esta fase.** La revision por voz es responsabilidad del gestor. Tu solo ves el resultado cuando el contrato esta aprobado.

### Firma electronica

Urus tiene su propio sistema de firma electronica. No se usa ningun servicio externo. El proceso completo es asi:

1. **El sistema genera un enlace de firma** unico para cada firmante (comprador, vendedor o ambos, segun el tipo de contrato).
2. **El firmante recibe el enlace por WhatsApp.** No tiene que descargar ninguna aplicacion ni registrarse en ninguna plataforma.
3. **El firmante abre el enlace, revisa el documento y verifica su identidad.** Para verificar su identidad, el sistema le envia un codigo de verificacion por SMS al numero de telefono que consta en la operacion. El firmante introduce ese codigo en la pantalla.
4. **El firmante firma en la pantalla** de su movil u ordenador.
5. **El sistema sella el documento firmado.** El documento queda protegido con:
   - Fecha y hora exacta de la firma.
   - Direccion de internet desde la que se firmo.
   - Pista de auditoria completa (quien, cuando, desde donde, con que codigo de verificacion).
   - Sello de integridad que garantiza que el documento no se ha modificado despues de la firma.
6. **El documento firmado se almacena de forma segura en Urus.** No se guarda en Inmovilla (Inmovilla no soporta almacenamiento de documentos a traves de su integracion).
7. **Urus actualiza automaticamente el estado de la propiedad en Inmovilla** para reflejar que el contrato esta firmado.

### Recordatorios automaticos si no se firma

Si el firmante no firma despues de recibir el enlace, Urus envia recordatorios automaticos:

- **Dia 1** despues del envio: primer recordatorio por WhatsApp.
- **Dia 3**: segundo recordatorio.
- **Dia 5**: tercer y ultimo recordatorio.
- **Tras 5 dias naturales sin firma**: el sistema escala la situacion. Crea una tarea urgente para el comercial asignado y para el gestor, avisando de que el firmante no ha firmado.

Tu no tienes que enviar recordatorios manualmente ni estar pendiente de si el firmante ha abierto el enlace. El sistema lo gestiona y te avisa si hay un problema.

### Control de versiones

Cada version del contrato queda guardada con:

- Numero de version (v1, v2, v3…).
- Fecha y hora en que se genero.
- Quien la genero o la modifico (sistema, gestor, etc.).
- Resumen de que cambio respecto a la version anterior.

La nomenclatura de los archivos sigue este formato:

- `OP-2026-000123_Arras_v1_Borrador.pdf` → primera version, borrador automatico.
- `OP-2026-000123_Arras_v2_CambiosGestor.pdf` → segunda version, con los cambios del gestor.
- `OP-2026-000123_Arras_Firmado.pdf` → version final firmada.

Ninguna version se borra. Siempre puedes consultar el historial completo del contrato dentro de la operacion.

---

## Que tienes que hacer tu

Tu papel en este proceso es minimo. El gestor se encarga de la revision y el sistema se encarga de la generacion y la firma. Lo que te toca a ti:

1. **Avanzar la operacion al estado correcto.** Cuando el comprador y el vendedor acuerdan una reserva, arras o cierre, tu mueves la operacion a esa fase en Urus. Ese avance es lo que dispara la generacion automatica del contrato.

2. **Completar los datos que falten, si el sistema te lo pide.** Si al intentar generar el contrato falta algun campo (DNI del comprador, direccion del vendedor, cuenta bancaria, etc.), el sistema crea una tarea a tu nombre indicando exactamente que datos necesita. Rellenalos en la operacion y el sistema reintenta la generacion sin que tengas que hacer nada mas.

3. **Nada mas.** No escribes el contrato, no lo revisas legalmente (eso es del gestor), no lo envias a firma (lo hace el sistema) y no envias recordatorios (tambien lo hace el sistema). Tu trabajo es gestionar la relacion con el cliente y asegurarte de que los datos esten completos.

---

## Que ves en pantalla

Dentro del detalle de la operacion en Urus, hay una seccion de **Contratos** donde puedes ver:

- **El estado del contrato**: borrador, en revision, aprobado, enviado a firma, firmado.
- **Todas las versiones**: con su numero, fecha, autor y resumen de cambios. Puedes abrir cualquier version anterior.
- **El estado de la firma de cada firmante**: si ha recibido el enlace, si lo ha abierto, si ha firmado. Aparece un indicador por cada persona que tiene que firmar.
- **Los recordatorios enviados**: cuantos se han mandado y cuando.
- **El documento firmado**: una vez que todos los firmantes han firmado, el documento final aparece aqui con su sello de integridad y su pista de auditoria.
- **Las tareas pendientes relacionadas**: si el sistema te ha pedido que completes datos, la tarea aparece vinculada al contrato.

No tienes que hacer nada en esta pantalla para que el proceso avance. Esta pensada para que consultes el estado, no para que actues (salvo completar datos si te lo piden).

---

## Relacion con Inmovilla

### Que se actualiza en Inmovilla

Cuando el contrato se firma, Urus actualiza automaticamente el estado de la propiedad en Inmovilla para reflejar la nueva situacion (reservada, con arras firmadas, vendida, etc.). Tu no tienes que entrar a Inmovilla a cambiarlo.

### Que NO se guarda en Inmovilla

Los documentos (borradores, versiones intermedias, contratos firmados) **no se almacenan en Inmovilla**. La integracion con Inmovilla no soporta adjuntar documentos. Todos los contratos viven en Urus, almacenados de forma segura.

### En resumen

| Que | Donde vive |
|---|---|
| Datos de la propiedad, comprador, vendedor | Inmovilla (fuente) → Urus (copia sincronizada) |
| Estado de la propiedad (vendida, reservada, etc.) | Inmovilla (actualizado automaticamente por Urus al firmar) |
| Contratos generados (borradores y versiones) | Solo en Urus |
| Contratos firmados | Solo en Urus |
| Pista de auditoria de la firma | Solo en Urus |
| Recordatorios de firma enviados | Solo en Urus |

---

## Preguntas frecuentes

### "¿Tengo que redactar yo el contrato?"

No. El sistema lo genera automaticamente a partir de los datos de la operacion y una plantilla predefinida. Tu no escribes ni editas texto legal.

### "¿Que pasa si faltan datos para generar el contrato?"

El sistema crea una tarea a tu nombre indicando exactamente que campos necesita (por ejemplo, "Falta DNI del comprador" o "Falta direccion del vendedor"). Rellena esos datos en la operacion y el sistema reintenta la generacion automaticamente.

### "¿Donde se guardan los contratos firmados?"

En Urus, de forma segura. No se guardan en Inmovilla porque su integracion no soporta almacenamiento de documentos.

### "¿La firma electronica tiene validez legal?"

Si. Es una firma electronica simple con verificacion de identidad (codigo por SMS), pista de auditoria completa (quien firmo, cuando, desde donde) y sello de integridad (que garantiza que el documento no se ha alterado). Es valida para las transacciones inmobiliarias habituales.

### "¿Que pasa si el comprador no firma a tiempo?"

El sistema envia recordatorios automaticos los dias 1, 3 y 5 despues de enviar el enlace de firma. Si pasan 5 dias naturales sin firma, el sistema escala la situacion creando una tarea urgente para ti y para el gestor.

### "¿Puedo ver versiones anteriores del contrato?"

Si. Todas las versiones quedan guardadas con su numero, fecha, autor y resumen de cambios. Ninguna version se elimina.

### "¿Quien revisa el contrato antes de enviarlo a firma?"

El gestor del equipo de administracion. Puede pedir cambios hablando en voz alta (revision por voz) o de forma escrita. Tu como comercial no participas en la revision legal; solo te aseguras de que los datos sean correctos.

### "¿El firmante necesita descargar alguna aplicacion?"

No. Recibe un enlace por WhatsApp, lo abre en el navegador de su movil u ordenador, verifica su identidad con un codigo SMS y firma en pantalla. No necesita registrarse ni instalar nada.

---

## Buenas practicas

- **Datos completos desde el principio.** Cuanto antes tengas el DNI, la direccion, el telefono y el correo de comprador y vendedor en la operacion, antes podra el sistema generar el contrato sin pedirte nada adicional.
- **Avanza la operacion en cuanto se produzca el acuerdo.** Si el comprador y el vendedor pactan una reserva, no dejes la operacion en "En curso" dos dias. Avanzala a Reserva para que el sistema arranque la generacion del contrato inmediatamente.
- **Responde rapido a las tareas de datos faltantes.** Si el sistema te pide un campo, rellenalo lo antes posible. Mientras no lo hagas, el contrato no se genera y el proceso se detiene.
- **No envies el contrato por tu cuenta.** El sistema se encarga de generar el enlace de firma y de enviarlo al firmante. Si lo mandas tu por otro canal, el firmante puede confundirse o firmar por una via que no queda registrada.
- **No envies recordatorios manuales.** El sistema ya tiene una cadencia de recordatorios (dia 1, 3 y 5). Si ademas tu escribes al firmante por WhatsApp, puede recibir mensajes duplicados.
- **Consulta el historial de versiones si tienes dudas.** Si no recuerdas que cambio entre una version y otra, abre el historial del contrato dentro de la operacion. Cada version tiene un resumen de los cambios.
- **Confia en la pista de auditoria.** Si un firmante dice que no firmo o que el documento se ha cambiado, la pista de auditoria y el sello de integridad demuestran exactamente que paso y cuando. Todo queda registrado.
