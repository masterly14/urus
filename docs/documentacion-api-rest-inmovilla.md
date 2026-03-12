# Documentación API REST v.1 Inmovilla

## General

##### Las peticiones API deben hacerse siempre a la URL https://procesos.inmovilla.com/api/v1.

##### Las peticiones que no se realicen vía HTTPS no serán procesadas.

##### Todas las peticiones deberán ir siempre acompañadas de un token que se facilitará desde

##### Inmovilla. Este token se añadirá a los headers con el key "Token", junto con el tipo de

##### formato JSON como aparece en la siguiente tabla. Para utilizar la API debéis solicitarnos un

##### token asociado a vuestra agencia, en la cual se incluirán los datos que enviéis.

##### Key Value Descripción

```
Content-
Type application/json
```
```
Las peticiones deben ser en formato
```
##### JSON

```
Token BBA1C0832599AC50DBAB46AD9CBACB
```
```
Genera el token de tu agencia desde
Inmovilla entrando en Ajustes >
Opciones > Token para API Rest.
```
_Importante:_

_- La API de Inmovilla no debe usarse para hacer cargas masivas diarias de datos, ya que para eso
tenemos otros procesos más óptimos por los cuales podéis solicitar información en
soporte@inmovilla.com.
- Los tokens caducarán automáticamente tras no tener actividad en los últimos 3 meses._

## Enums

##### Las peticiones ENUM sirven para obtener los valores correctos para cada parámetro. Esta

##### petición está restringida a 2 veces por minuto ya que no debe utilizarse para mapear

##### campos, si no para listar y almacenar los valores para luego enviar los datos de forma

##### correcta.

### Enums - Calidades GET

##### /enums/?calidades

##### Se puede obtener el listado de calidades haciendo la petición de calidades, estos campos

##### tendrán los valores true o false, ya que son booleanos.

```
GENERAL ENUMS CLIENTES
```
```
PROPIEDADES /
PROSPECTOS
```
```
PROPIETARIOS ERRORES
```

#### Respuesta:

##### HTTP/1.0 200 OK

##### [

##### {

##### "campo": "adaptadominus",

##### "valores": "true/false"

##### },

##### {

##### "campo": "agua",

##### "valores": "true/false"

##### },

##### {

##### "campo": "airecentral",

##### "valores": "true/false"

##### },

##### {

##### "campo": "aire_con",

##### "valores": "true/false"

##### },

##### {

##### "campo": "alarma",

##### "valores": "true/false"

##### },

##### ...

#### Posibles errores:

##### Error Código Error Descripción

```
400 400007 No existe el tipo Para parámetro 'calidades' no es necesarioasignarle ningún valor
```
```
408 408 Demasiadas peticiones Sólo puedes hacer 2 peticiones cada 60segundos
```
### Enums - Tipos GET

##### /enums/?tipos

##### Para obtener el listado completo de los diferentes tipos que contiene una propiedad, y la

##### relación campo-valor de los mismos podemos hacer la petición de tipos, en estos campos

##### se incluyen tipos como el tipo de la propiedad, el tipo de operación, tipo de

##### fachada, etc. La respuesta nos devolverá el nombre de cada tipo con los valores que puede

##### tener, estos tipos se podrán pasar por parámetro en otra petición que se explica después.


#### Respuesta:

##### HTTP/1.0 200 OK

##### {

##### "keyacci": [

##### {

##### "nombre": "Vender",

##### "valor": 1

##### },

##### {

##### "nombre": "Alquilar",

##### "valor": 2

##### }

##### ],

##### "keycarpin": [

##### {

##### "nombre": "Aluminio",

##### "valor": 1

##### },

##### {

##### "nombre": "Madera",

##### "valor": 2

##### },

##### {

##### "nombre": "PVC",

##### "valor": 3

##### },

##### {

##### "nombre": "Wengué",

##### "valor": 16

##### }

##### ],

##### ...

##### Se podrá solicitar un solo tipo si pasarmos por parámetro el nombre del tipo que queremos

##### obtener, nos devolverá el nombre y el valor del campo pasado por parámetro.

##### /enums/?tipos={tipo}

#### Tipos:

##### Campo Tipo Descripción

```
cocina_inde enum Cocina independiente
conservacion enum Conservación / Estado de la propiedad
destacado enum Propiedad destacada para la web
```

##### Campo Tipo Descripción

```
electro enum Cocina equipada con electrodomésticos
eninternet enum Enviar a la web y/o portales inmobiliarios
estadoficha enum Estado de la propiedad
idioma enum Listado de idiomas
keyacci enum Tipo de operación
keyagua enum Tipo de agua
keygua enum Tipo de agua
keycalefa enum Tipo de calefacción
keycalle enum Tipo de vía
keycarpin enum Tipo de carpintería
keycarpinext enum Tipo de carpintería exterior
keyelectricidad enum Tipo de instalación eléctrica
keyfachada enum Tipo de fachada
keyori enum Orientación de la propiedad
keysuelo enum Tipo de suelo
keytecho enum Tipo de techo
keyvista enum Tipo de vista
key_loca enum Código de la localidad/ciudad. (Véase: Enums - Ciudades)
key_tipo enum Tipo de propiedad. (Véase: Enums - Tipo Propiedades)
key_zona enum Código de la zona. (Véase: Enums - Zonas)
tgascom enum Periodicidad de la comunidad
tipovpo enum Tipo de régimen
todoext enum Todo exterior
vercalle enum Visibilidad de la ubicación de la propiedad
x_entorno enum Tipo de entornos
```
#### Posibles errores:

##### Error Código Error Descripción

```
404 404001 No existe el tipo El tipo pasado por parámetro no existe
400 400005 No existe el tipo key_loca incorrecto (debe ser númerico yseparado por ',')
```

##### Error Código Error Descripción

```
400 400008 Parámetro incorrecto Para obtener los valores del campo key_localanzar esta petición: /enums/?ciudades
```
```
400 400009 Parámetro incorrecto
```
```
Para obtener los valores del campo key_zona
lanzar esta petición: /enums/?zonas=
{key_loca}
408 408 Demasiadas peticiones Sólo puedes hacer 2 peticiones cada 60segundos
```
### Enums - Paises GET

##### /enums/?paises

##### Podemos hacer la petición de paises para pasarlos por parámetro a las ciudades, para

##### poder obtener las ciudades de cada pais.

#### Respuesta:

##### HTTP/1.0 200 OK

##### [

##### {

##### "pais": "España",

##### "valor": "724",

##### "iso2": "ES",

##### "iso3": "ESP"

##### },

##### {

##### "pais": "Portugal",

##### "valor": "620",

##### "iso2": "PT",

##### "iso3": "PRT"

##### },

##### {

##### "pais": "Italia",

##### "valor": "380",

##### "iso2": "IT",

##### "iso3": "ITA"

##### },

##### {

##### "pais": "Francia",

##### "valor": "250",

##### "iso2": "FR",

##### "iso3": "FRA"

##### },

##### {

##### "pais": "Reino Unido",

##### "valor": "826",

##### "iso2": "GB",


##### "iso3": "GBR"

##### },

##### {

##### "pais": "Andorra",

##### "valor": "020",

##### "iso2": "AD",

##### "iso3": "AND"

##### },

##### ...

#### Posibles errores:

##### Error Código Error Descripción

```
408 400008 Parámetro incorrecto Para parámetro 'paises' no es necesarioasignarle ningún valor
```
```
408 408 Demasiadas peticiones Sólo puedes hacer 2 peticiones cada 60segundos
```
### Enums - Ciudades GET

##### /enums/?ciudades

##### Podemos obtener todas las ciudades separadas por provincias. En los resultados irán

##### incluídos los códigos del pais y la provincia a la que pertenece la ciudad/localidad. Por

##### defecto mostará las ciudades de España, pero si quisiéramos listar las ciudades de

##### cuaquier otro pais debemos pasar por parámetro el pais.

##### /enums/?ciudades={pais}

#### Respuesta:

##### HTTP/1.0 200 OK

##### [

##### {

##### "pais": 0,

##### "provincia": "ALICANTE",

##### "cod_prov": 4,

##### "ciudades": [

##### {

##### "ciudad": "Adsubia",

##### "key_loca": 31599

##### },

##### {

##### "ciudad": "Agost",

##### "key_loca": 31699


##### },

##### ...

#### Posibles errores:

##### Error Código Error Descripción

```
408 400006 Parámetro incorrecto El parámetro de ciudades (pais) debe sernúmerico
```
```
408 408 Demasiadas peticiones Sólo puedes hacer 2 peticiones cada 60segundos
```
### Enums - Zonas GET

##### /enums/?zonas={key_loca}

##### Para obtener el listado de zonas de una ciudad debemos pasarle al parámetro zonas el

##### código de la ciudad que deseemos. Por ejemplo, como aparece en el anterior ejemplo como

##### respuesta, la ciudad Agost de Alicante tiene el código 31699 , por lo que la petición deberá

##### ser zonas=368799. Y con esto obtendremos todas las zonas que existen en dicha ciudad.

#### Respuesta:

##### HTTP/1.0 200 OK

##### [

##### "31699": [

##### {

##### "zona": "Partida PozoBlanco",

##### "key_zona": 2512711

##### },

##### {

##### "ciudad": "Urb. las lomas",

##### "key_loca": 883111

##### },

##### ...

##### También es posible solicitar zonas de varias ciudades a la vez, para esto debemos

##### solicitarlo con los códigos de ciudades separados por comas. La estructura del resultado

##### será exactamente la misma.

##### /enums/?zonas={key_loca,key_loca,key_loca}


#### Posibles errores:

##### Error Código Error Descripción

###### 400 400005

```
key_loca incorrecto
(debe ser númerico y
separado por ',')
```
```
El key_loca pasado por parámetro debe ser un
valor numérico y si son varios, deben estar
separado por ','
406 400006 Parámetro incorrecto Para parámetro 'ciudades' no es necesarioasignarle ningún valor
```
```
404 404002 No existe el key_loca(ciudad) El código de key_loca solicitado no existe
```
```
408 408 Demasiadas peticiones Sólo puedes hacer 2 peticiones cada 60segundos
```
## Clientes

### Solicitar Cliente GET

##### /clientes/?cod_cli={cod_cli}

##### Para obtener un cliente debe solicitarse con el código único del mismo, el parámetro

##### cod_cli.

#### Respuesta:

##### HTTP/1.0 200 OK

##### {

##### "cod_cli": "13449756",

##### "nombre": "Pedro",

##### "apellidos": "Picapiedra",

##### "nif": "Z7347280G",

##### "email": "pedro@picapiedra.com",

##### "calle": "Av. Libertad",

##### "numero": "123",

##### "planta": "3",

##### "puerta": "der",

##### "escalera": "3",

##### "cp": "03201",

##### "localidad": "Elche",

##### "provincia": "Alicante",

##### "pais": "España",

##### "nacionalidad": "Española",

##### "telefono1": 666554433,

##### "telefono2": 666221100,

##### ...


```
 
```
##### }

### Crear Cliente POST

##### /clientes/

##### Para crear un cliente es necesario enviar el nombre y los datos más básicos, se creará un

##### cliente sin vinculación alguna. Es posible vincularlo más tarde con la propiedad deseada

##### para convertirlo en propietario.

#### Petición:

##### {

##### "nombre": "Pedro",

##### "apellidos": "Picapiedra",

##### "nif": "12345678K",

##### "email": "pedro.picapiedra@inmovilla.com",

##### "telefono1": 666554433,

##### "telefono2": 666221100,

##### "telefono2": 666001122

##### }

#### Respuesta:

##### HTTP/1.0 201 Created

##### {

##### "cod_cli":11223344,

##### "codigo": 201,

##### "mensaje": "Cliente creado y vinculado a la propiedad con cod_ofer

##### }

### Editar Cliente PUT

##### /clientes/

##### Para editar/actualizar un cliente es obligatorio enviar el código del mismo (cod_cli). Sólo

##### debe enviarse los campos que se van a modificar o añadir, en el ejemplo siguiente


##### actualizaremos la dirección de email.

#### Petición:

##### {

##### "cod_cli": 11223344,

##### "email": "emailejemplo@inmovilla.com"

##### }

#### Respuesta:

##### HTTP/1.0 202 Accepted

##### {

##### "cod_cli":11223344,

##### "codigo": 202,

##### "mensaje": "Cliente actualizado"

##### }

### Eliminar Cliente DELETE

##### /clientes/{cod_cli}

##### Para eliminar un cliente tan sólo es necesario hacer la petición DELETE a la url de clientes

##### con el identificador del mismo (cod_cli). El sistema avisará si dicho cliente está vinculado

##### con alguna propiedad o demanda, en dicho caso no se eliminará el cliente, ya que antes

##### habrá que desvincularlo.

#### Respuesta:

##### HTTP/1.0 200 OK

##### {

##### "codigo": 200,

##### "mensaje": "Cliente eliminado"

##### }


#### Campos:

##### Campo Tipo Descripción Requerido en

```
cod_cli numérico Identificador único GET PUT DELETE
nombre texto Nombre del propietario POST
apellidos texto Apellidos del propietario
nif texto NIF / DNI / CIF
email texto Dirección de Email / Correo electrónico
calle texto Nombre de la dirección del propietario
numero texto Número de la dirección del propietario
planta numérico Nº de planta de la dirección delpropietario
puerta texto Puerta de la dirección del propietario
escalera texto Escalera de la dirección del propietario
cp texto Código Postal
localidad texto Localidad / Ciudad
provincia texto Provincia
nacionalidad texto Nacionalidad
pais texto Pais del propietario
prefijotel1 numérico Prefijo teléfono fijo
prefijotel2 numérico Prefijo teléfono móvil
prefijotel3 numérico Prefijo otro teléfono
prefijotel4 numérico Prefijo teléfono fijo cónyuge
prefijotel5 numérico Prefijo teléfono móvil cónyuge
telefono1 numérico Teléfono fijo
telefono2 numérico Teléfono móvil
telefono3 numérico Otro teléfono
telefono4 numérico Teléfono fijo cónyuge
telefono5 numérico Teléfono móvil cónyuge
fechanacimiento fecha Fecha de Nacimiento (Formato 1984-09-05 23:25:00)
altacliente fecha Fecha de alta del propietario
conyuge texto Nombre del Cónyuge
conemail texto Dirección de Email del Cónyuge
```

##### Campo Tipo Descripción Requerido en

```
connif texto NIF del Cónyuge
keymedio numérico Medio de contacto por el cual ha sidocontactado
```
```
keycomercial numérico Identificador único del comercial(Gestionado por)
```
```
captadopor numérico Identificador único del comercial(Captado por)
observacion texto Observaciones
nonewsletters numérico Newsletters: 0 Pendiente - 3 ValidadoOficina - 1 Rechazado - 6 Fallo Entrega
```
```
gesauto numérico
```
```
Envío de prop. por email: 0 Pendiente -
2 Validado Oficina - 4 Rechazado - 5
Validado Portal - 6 Fallo Entrega
```
```
rgpdwhats numérico
```
```
Envío de prop. por Whatsapp: 0
Pendiente - 2 Validado Oficina - 4
Rechazado - 5 Validado Portal - 6 Fallo
Entrega
```
```
enviosauto booleano
```
```
Activar que al cliente se le envíen mails
de manera automática (siempre y
cuando no entre en conflicto con el
campo gesauto)
```
### Buscar un Cliente GET

##### /clientes/buscar/?telefono={telefono}&email={email}

##### Podrás hacer búsquedas de clientes buscando los contactos coincidentes con el teléfono y

##### el email. El campo telefono buscará internamente en los tres campos de teléfonos

##### disponibles de cada cliente. Los parámetros se concatenarán como un AND, es decir, si

##### pasamos tanto el parámetro telefono como el email buscará clientes que cumplan con

##### los dos parámetros.

#### Respuesta:

##### HTTP/1.0 200 OK

##### {

##### "cod_cli": "13449756",

##### "nombre": "Pedro",

##### "apellidos": "Picapiedra",

##### "nif": "Z7347280G",

##### "email": "pedro@picapiedra.com",

##### "calle": "Piedradura",

##### "numero": "45",


##### "...": "...",

##### "agente": {

##### "id": "12326",

##### "nombre": "Antonio",

##### "apellidos": "Piedraita",

##### "email": "apiedraita@piedraita.com",

##### "email_interno": "apiedraita.4856@inmovilla.com",

##### "telefono1": "65564646578",

##### "telefono2": "96556568964"

##### }

##### },

##### {

##### "cod_cli": "163541487",

##### "nombre": "Pablo",

##### "apellidos": "Mármol",

##### "nif": "75462806T",

##### "email": "pablo@marmol.com",

##### "calle": "Piedradura",

##### "numero": "48",

##### "...": "...",

##### "agente": {

##### "id": "123456",

##### "nombre": "Amparo",

##### "apellidos": "Piedrolar",

##### "email": "apiedrolar@piedradura.com",

##### "email_interno": "apiedrolar.4565@inmovilla.com",

##### "telefono1": "65498416478",

##### "telefono2": "96546548964"

##### }

##### }

#### Posibles errores:

##### Error Código Error Descripción

```
400 400001 Petición Errónea Petición mal formada, comprueba que elcontenido ha sido bien parseado.
400 400002 Petición Errónea No se han enviado parámetros.
400 400003 Error al guardar Ha ocurrido un error al crear, editar o eliminarel cliente
```
```
404 404002 Sin resultados No existe ningún cliente con los parámetrossolicitados.
```
```
405 405001 Método no permitido El método solicitado no está disponible (GET,POST, PUT, DELETE, etc.)
```
```
406 406001 Campo {x} requerido El campo {x} es obligatorio y no ha sidoenviado.
406 406002 Campo {x} no válido El campo {x} no es válido o está mal escrito.
```

```
 
```
##### Error Código Error Descripción

```
406 406004 Cliente vinculado El cliente está vinculado (propiedad odemanda) y no se puede eliminar
406 406006 Código no existe El código {x} facilitado no existe
408 408 Demasiadas peticiones Límite de 20 peticiones de clientes cadaminuto
```
## Propiedades y Prospectos

### Solicitar Propiedad o Prospecto GET

##### /propiedades/?cod_ofer={cod_ofer}

##### Para obtener los datos de una propiedad puede solicitarse de varias maneras. En la

##### siguiente tabla se detallan las distintas posibilidades. La prioridad se utiliza si se envían

##### varios parámetros, en este caso el sistema dará más importancia a los parámetros de

##### prioridad alta.

##### Fotografías de una Propiedad o Prospecto

##### Las fotos de un inmueble se obtienen construyendo la URL utilizando ciertos parámetros.

##### Ejemplo de URL:: https://fotos15.inmovilla.com/413/9983361/8-

##### | Parámetro | Descripción

##### | ------------ | --------------------------------------------

##### | `numagencia` | ID de agencia (por ejemplo, 413)

##### | `cod_ofer` | Código del inmueble (por ejemplo, 9983361)

##### | `fotoletra` | Identificador base de la foto (por ejemplo,

##### | `numfotos` | Número incremental de la foto (empieza en 1

##### La url se compone de la siguiente manera: https://fotos15.inm

##### N representa el número de la foto. Si una propiedad tiene num

#### Parametros:

##### Parámetro Descripción Prioridad

```
cod_ofer Código único de la propiedad. Alta
ref Puede solicitarse con la referencia pública de la propiedad. Baja
```

#### Respuesta:

##### HTTP/1.0 200 OK

##### {

##### "cod_ofer": 87654321,

##### "keyacci": 1,

##### "banyos": 2,

##### "keycli": 12345678,

##### "fecha": "2018-09-05 11:15:00",

##### "keyori": 0,

##### "ref": "ABC-63653",

##### "nodisponible": 0,

##### "precio": 115000,

##### "precioinmo": 120000,

##### "key_loca": 37899,

##### "key_zona": 1214099,

##### "key_tipo": 3399,

##### "calle": "Avenida Libertad",

##### "planta": 5,

##### "numero": 123,

##### ...

##### }

### Crear Propiedad o Prospecto POST

##### /propiedades/

##### Para crear propiedades deben enviarse en formato JSON con sus valores correspondientes.

##### Es posible crear prospectos tan sólo enviando el parámetro prospecto a true. Para enviar

##### las imágenes existe el parámetro fotos el cual será un objeto que debe incluir las urls de

##### las fotografías. El orden de las fotos será el mismo de los índices, aunque es posible enviar

##### el parámetro posicion para forzarles un orden diferente al del propio objeto. El sistema

##### detectará en las modificaciones que se envíen si la url es la misma o diferente, si la url no

##### cambia las fotos no se sobreescribirán, para sobreescribirlas es necesario que la url de la

##### foto sea diferente.

#### Petición:

##### {

##### "ref": "36532543",

##### "keyacci": 1,

##### "key_tipo": 3399,

##### "key_loca": "368799",

##### "nodisponible": false,

##### "precioinmo": 250000,


##### "banyos": 3,

##### "habitaciones": 2,

##### "fotos": {

##### "1": {

##### "url": "https://crm.inmovilla.com/imagenes/foto001.jpg",

##### "posicion": 1

##### },

##### "2": {

##### "url": "https://crm.inmovilla.com/imagenes/foto002.jpg",

##### "posicion": 2

##### }

##### }

##### }

#### Respuesta:

##### HTTP/1.0 201 Created

##### {

##### "codigo": 201,

##### "mensaje": "Propiedad guardada"

##### }

#### Campos:

##### Campo Tipo Descripción Requeridoen

```
adaptadominus booleano Adaptado PMR (Personas MovilidadReducida)
agua booleano Agua
airecentral booleano Aire central
aire_con booleano Aire acondicionado
alarma booleano Alarma
alarmaincendio booleano Alarma de incendio
alarmarobo booleano Alarma de robo
alta_exclusiva fecha Fecha de inicio de exclusiva (Formato2018-06-05 18:30:15)
altillo numérico Altillo
alturatecho numérico Altura del techo
```

##### Campo Tipo Descripción Requeridoen

```
antiguedad numérico Año de construcción
apartseparado booleano Apartamento separado
arboles booleano Árboles
arma_empo booleano Armario empotrado
ascensor booleano Ascensor
aseos numérico Aseos
autobuses booleano Autobuses
baja_exclusiva fecha Fecha de fin de exclusiva (Formato2018-06-05 18:30:15)
balcon booleano Balcón
banyos numérico Baños
bar booleano Bar
barbacoa booleano Barbacoa
bombafriocalor booleano Bomba frío/calor
buhardilla booleano Buhardilla
cajafuerte booleano Caja fuerte
calefaccion booleano Calefacción
calefacentral booleano Calefacción central
calle texto Dirección
captadopor numérico Código del agente captador
centrico booleano Céntrico
centros_comerciales booleano Centros comerciales
centros_medicos booleano Centros Médicos
cerca_de_universidad booleano Cerca de la Universidad
cesioncom numérico Comisión de cesión
chimenea booleano Chimenea
cocina_inde enum Cocina independiente
colegios booleano Colegios
comision numérico Comisión
comunidadincluida booleano Si viene incluida la cuota de lacomunidad
conservacion enum Conservación / Estado de la propiedad
```

##### Campo Tipo Descripción Requeridoen

```
contactadopor texto Medio por el que ha sidocontactado/captado el inmueble
costa booleano Costa
cp texto Código postal
depoagua booleano Depósito de agua
descalcificador booleano Descalcificador
descripcionaleman texto Descripción en Alemán
descripcioncatalan texto Descripción en Catalán
descripciones texto Descripción en Castellano/Español
descripcionfrances texto Descripción en Francés
descripcioningles texto Descripción en Inglés
descripcionruso texto Descripción en Ruso
despensa booleano Despensa
destacado enum Propiedad destacada para la web
diafano booleano Diáfano
distmar numérico Distancia al mar (en metros)
electro enum Cocina equipada conelectrodomésticos
```
```
emisionesletra texto Emisiones (Letra del certificado deemisiones)
emisionesvalor numérico Emisiones (valor en Kg CO2/m2)
energialetra texto Energía (Letra del certificadoenergético)
```
```
energiarecibido numérico
```
```
Estado del certificado energético: 0
Certificado Pendiente - 1 Aportado - 2
En Trámites - 3 Exento
energiavalor numérico Energía (consumo en KW h/m2)
eninternet enum Enviar a la web y/o portalesinmobiliarios
entidadbancaria numérico Entidad bancaria
escalera texto Dirección (Escalera)
esquina booleano Esquina
estadoficha enum Estado de la propiedad
exclu booleano La propiedad está en exclusiva
```

##### Campo Tipo Descripción Requeridoen

```
fecha fecha Fecha de alta (Formato 2018-06-0518:30:15)
```
```
fechaact fecha Fecha de última actualización (Formato2018-06-05 18:30:15)
```
```
fechamod fecha Fecha de modificación (Formato 2018-06-05 18:30:15)
galeria booleano Galería
garajedoble booleano Garaje doble
gasciudad booleano Gas ciudad
gastos_com numérico Cuota de la comunidad
gimnasio booleano Gimnasio
golf booleano Golf
habdobles numérico Habitaciones dobles
habitaciones numérico Habitaciones simples
habjuegos booleano Habitación de juegos
haycartel booleano Tiene cartel de venta/alquiler colocado
hidromasaje booleano Hidromasaje
hilomusical booleano Hilo musical
hospitales booleano Hospitales
jacuzzi booleano Jacuzzi
jardin booleano Jardín
keyacci enum Tipo de operación POST
keyagente numérico Código del agente gestor
keyagua enum Tipo de agua
keycalefa enum Tipo de calefacción
keycalle enum Tipo de vía
keycarpin enum Tipo de carpintería
keycarpinext enum Tipo de carpintería exterior
keyelectricidad enum Tipo de instalación eléctrica
keyfachada enum Tipo de fachada
keygua enum Tipo de agua
keyori enum Orientación de la propiedad
```

##### Campo Tipo Descripción Requeridoen

```
keysuelo enum Tipo de suelo
keytecho enum Tipo de techo
keyvista enum Tipo de vista
key_loca enum Código de la localidad/ciudad. (Véase:Enums - Ciudades) POST
```
```
key_tipo enum Tipo de propiedad. (Véase: Enums -Tipo Propiedades) POST
```
```
key_zona enum Código de la zona. (Véase: Enums -Zonas)
latitud numérico Coordenada (Latitud)
lavanderia booleano Lavandería
linea_tlf booleano Línea telefónica
longitud numérico Coordenada (Longitud)
luminoso booleano Luminoso
luz booleano Luz
metro booleano Metro
mirador booleano Mirador
montacargas booleano Montacargas
montana booleano Montaña
muebles booleano Muebles
m_altillo numérico Metros del altillo
m_cocina numérico Metros de la cocina
m_comedor numérico Metros del comedor
m_cons numérico Metros construidos
m_fachada numérico Metros de la fachada
m_parcela numérico Metros de la parcela
m_sotano numérico Metros del sótano
m_terraza numérico Metros de la terraza
m_utiles numérico Metros útiles
nodisponible booleano Si la propiedad no está disponible
nplazasparking numérico Cantidad de plazas de parking
numero texto Dirección (Número del portal)
```

##### Campo Tipo Descripción Requeridoen

```
numllave texto Número de llavero
numplanta numérico Dirección (Número total de plantas)
numsucursal numérico Id de la agencia sucursal
ojobuey booleano Ojos de buey
opcioncompra booleano La propiedad tiene opción a compra
outlet numérico Precio anterior del inmueble (por si seha rebajado)
parking numérico Parking
parques booleano Parques
patio booleano Patio
pergola booleano Pérgola
piscina_com booleano Piscina comunitaria
piscina_prop booleano Piscina propia
planta numérico Dirección (Nº de planta)
plaza_gara numérico Plaza de garaje
porceniva numérico Porcentaje del IVA
precioalq numérico Precio de Alquiler
precioinmo numérico Precio de la propiedad para lainmobiliaria
precioiva numérico IVA del precio
preciotraspaso numérico Precio del traspaso de la propiedad
preinstaacc booleano Preinstalación del aire acondicionado
preinsthmusi booleano Preinstalación de hilo musical
primera_linea booleano Si está en primera línea
prospecto booleano Indica si la propiedad es un prospecto
puerta texto Dirección (Puerta)
puertasauto booleano Puertas automáticas
puerta_blin booleano Puerta blindada
rcatastral texto Dato catastral (Referencia catastral)
rdirfinca texto Dato catastral (Dirección de la finca)
ref texto Referencia de la propiedad (Debe serúnica para cada propiedad) POST
```

##### Campo Tipo Descripción Requeridoen

```
registrod texto Dato catastral (Registro)
rfolio numérico Dato catastral (Folio)
riegoauto booleano Riego automático
rletra texto Dato catastral (Letra)
rlibro numérico Dato catastral (Libro)
rnumero numérico Dato catastral (Número)
rnumeroinscr numérico Dato catastral (Número inscripción)
rtomo numérico Dato catastral (Tomo)
rural booleano Rural
salon numérico Salón
satelite booleano Satélite
sauna booleano Sauna
solarium booleano Solarium
sotano booleano Sótano
supermercados booleano Supermercados
tenis booleano Pista de tenis propia
teniscom booleano Pista de tenis comunitaria
terraza booleano Terraza
terrazaacris booleano Terraza acristalada
tfachada texto Descripción del fachada
tgascom enum Periodicidad de la comunidad
tinterior texto Descripción del interior
tipomensual texto Periodicidad del alquiler
tipovpo enum Tipo de régimen
tituloaleman texto Título en Alemán
titulocatalan texto Título en Catalán
tituloes texto Título en Castellano/Español
titulofrances texto Título en Francés
tituloingles texto Título en Inglés
tituloruso texto Título en Ruso
todoext enum Todo exterior
```

##### Campo Tipo Descripción Requeridoen

```
tranvia booleano Tranvía
trastero booleano Trastero
tren booleano Tren
trifasica booleano Sistema eléctrico trifásico
tv booleano Televisión
urbanizacion booleano Urbanización
urlprospecto texto URL del prospecto captado
vallado booleano Vallado
vercalle enum Visibilidad de la ubicación de lapropiedad
vestuarios booleano Vestuarios
video_port booleano Videoportero
vigilancia_24 booleano Vigilancia 24H
vistasalmar booleano Tiene vistas al mar
x_entorno enum Tipo de entornos
zona texto Si no se envía key_zona, se puedeenviar el nombre de la zona aquí.
zonasinfantiles booleano Zonas infantiles
zona_de_paso booleano Zona de Paso
fotos objeto Debe ser un objeto que contenga las urlde las fotografías.
```
#### Posibles errores:

##### Error Código Error Descripción

```
400 400001 Petición Errónea Petición mal formada, comprueba que elcontenido ha sido bien parseado.
400 400002 Petición Errónea No se han enviado parámetros.
400 400003 Error al guardar lapropiedad Ocurrió un error al guardar la propiedad.
```
```
400 400004 Error al insertar lapropiedad Ocurrió un error al insertar la propiedad.
```
```
405 405001 Método no permitido El método solicitado no está disponible (GET,POST, PUT, DELETE, etc.)
```

##### Error Código Error Descripción

```
406 406001 Campo {x} requerido El campo {x} es obligatorio y no ha sidoenviado.
406 406002 Campo {x} no válido El campo {x} no es válido o está mal escrito.
```
```
406 406003 Error al actualizarprospecto
```
```
El prospecto que se intenta actualizar ya ha
sido convertido a propiedad (se facilita la
referencia de dicha propiedad).
```
### Editar Propiedad o Prospecto POST

##### Para actualizar una propiedad debe utilizarse el mismo método que el de agregar,

##### igualmente enviando todos los campos ya que la API actualizará todos los valores de

##### nuevo. En este caso es el campo ref el que se utilizará para identificar y actualizar la

##### propiedad. Es posible pasar de una propiedad a prospecto y viceversa, tan sólo debéis

##### enviar el parámetro prospecto con el valor deseado. Muy importante enviar la referencia

##### exacta en cada petición.

### Desactivar Propiedad o Prospecto POST

##### Dar de baja una propiedad debe utilizarse el mismo método que el de agregar, igualmente

##### enviando todos los campos ya que la API actualizará todos los valores de nuevo. En este

##### caso es el campo ref el que se utilizará para identificar la propiedad. En este caso habrá

##### que enviar el valor de nodisponible a true. Muy importante enviar la referencia exacta en

##### cada petición.

### Listar Propiedades y Prospectos GET

##### /propiedades/?listado

##### Puedes extraer el listado de propiedades y prospectos ordenados por fecha de

##### actualización. Ten en cuenta que los prospectos que tengan la referencia vacía no se

##### mostrarán en este listado.

#### Respuesta:

##### HTTP/1.0 200 OK

##### [

##### {

##### "cod_ofer": 8284709,

##### "ref": "PR00182",

##### "nodisponible": false,

##### "prospecto": true,

##### "fechaact": "2018-09-20 10:12:25"

##### },

##### {

##### "cod_ofer": 8284690,

##### "ref": "PR00180",

##### "nodisponible": false,


##### "prospecto": true,

##### "fechaact": "2018-09-19 17:10:07"

##### },

##### {

##### "cod_ofer": 8284650,

##### "ref": "PR00178",

##### "nodisponible": false,

##### "prospecto": true,

##### "fechaact": "2018-09-19 17:05:02"

##### },

##### {

##### ...

##### ]

### Información Extra de la Propiedad GET

##### /propiedades/?extrainfo&cod_ofer={cod_ofer}

##### Puedes extraer información extra de la propiedad como por ejemplo la información de

##### publicación en portales.

#### Parametros:

##### Parámetro Descripción Prioridad

```
cod_ofer Código único de la propiedad de la que se quiere obtener lainformación. Alta
```
```
ref Puede solicitarse con la referencia de la propiedad de la que sequiere obtener la información. Media
```
#### Respuesta:

##### HTTP/1.0 200 OK

##### [

##### "publishinfo": {

##### "idealista": {

##### "state": "11",

##### "message": "Sent successfully.",

##### "alerts_number": "12345",

##### "quality_percentage": "62",

##### "publication_url": "https://www.idealista.com/inmueble/123

##### },

##### "pisoscom": {

##### "state": "10",

##### "message": "Sent successfully.",

##### "publication_url": "https://www.pisos.com/detalle/12345678

##### },


 

##### "fotocasa": {

##### "state": "12",

##### "message": "Successfully deactivated."

##### },

##### ...

##### },

##### "leads": [

##### {

##### "date": "2025-08-22 10:08:55",

##### "language": "es_ES",

##### "source": "idealista.com",

##### "contact_firstname": "Name",

##### "contact_lastname": "Lastname",

##### "contact_phone": "+34 123456789",

##### "contact_mobile": "",

##### "contact_email": "example@email.com",

##### "message": "Message text example. \n Hello, I'm interested

##### },

##### ...

##### ]

##### ]

#### Campos:

##### Parámetro Tipo Descripción

```
publishinfo array Contiene los portales donde estápublicada la propiedad actualmente.
```
```
publishinfo/state int
```
```
Indica el estado actual de la
publicación de la propiedad en el portal
asociado.
publishinfo/message texto Indica el último mensaje que devolvióel proceso al publicar la propiedad.
```
```
publishinfo/alerts_number int
```
```
Indica la cantidad de cruces que se han
realizado con el portal. (Exclusivo de
idealista)
publishinfo/quality_percentage int Indica la calidad del anuncio publicado.(Exclusivo de idealista)
```
```
publishinfo/publication_url texto
```
```
Url de la ficha del anuncio en el portal
específico. (No disponible para todos
los portales)
leads array Contiene los leads recibidos para lapropiedad consultada.
```
```
leads/date string La fecha en la que se ha recibido ellead.
leads/language string El idioma del lead en formato ISO.
```

##### Parámetro Tipo Descripción

```
leads/source string El medio por el que ha llegado el lead.
leads/contact_firstname string El nombre de la persona que hacontactado.
```
```
leads/contact_lastname string El apellido de la persona que hacontactado.
```
```
leads/contact_phone string El teléfono fijo de contacto del leadcorrespondiente.
```
```
leads/contact_mobile string El teléfono móvil de contacto del leadcorrespondiente.
```
```
leads/contact_email string El mail de contacto del leadcorrespondiente.
```
```
leads/message string El mensaje o anotación del leadcorrespondiente.
```
#### Valores:

##### Campo Valor Descripción

```
state 10 Propiedad publicada correctamente.
state 11 Propiedad publicada en el microsite.
state 12 Propiedad no publicada.
state 7 Propiedad publicada, pero con una alerta.
state 9 Propiedad no publicada por un error.
```
### Leads GET

##### /propiedades/?leads&dateStart={dateStart}&dateEnd={dateEnd}&page={page}

##### Poder obtener los leads de una agencia filtrando por fecha. Máximo 10 resultados por

##### página. Puedes paginar con el parámetro page.

#### Parametros:

##### Parámetro Descripción Prioridad

```
dateStart Fecha desde la que se quieren obtener los leads. Alta
dateEnd Fecha desde la que se quieren obtener los leads. Alta
page Página de resultados que se quiere consultar. Alta
```
#### Respuesta:


```
 
```
##### HTTP/1.0 200 OK

##### [

##### "leads": [

##### {

##### "date": "2025-08-22 10:08:55",

##### "language": "es_ES",

##### "source": "idealista.com",

##### "contact_firstname": "Name",

##### "contact_lastname": "Lastname",

##### "contact_phone": "+34 123456789",

##### "contact_mobile": "",

##### "contact_email": "example@email.com",

##### "message": "Message text example. \n Hello, I'm interested

##### },

##### ...

##### ]

##### ]

#### Campos:

##### Parámetro Tipo Descripción

```
leads array Contiene los leads recibidos para la propiedadconsultada.
leads/date string La fecha en la que se ha recibido el lead.
leads/language string El idioma del lead en formato ISO.
leads/source string El medio por el que ha llegado el lead.
leads/contact_firstname string El nombre de la persona que ha contactado.
leads/contact_lastname string El apellido de la persona que ha contactado.
leads/contact_phone string El teléfono fijo de contacto del leadcorrespondiente.
```
```
leads/contact_mobile string El teléfono móvil de contacto del leadcorrespondiente.
leads/contact_email string El mail de contacto del lead correspondiente.
leads/message string El mensaje o anotación del leadcorrespondiente.
```
## Propietarios

### Solicitar Propietario GET


##### /propietarios/?cod_cli={cod_cli}

##### Para obtener un propietario puede solicitarse de varias maneras, pudiendo enviar varios

##### parámetros. En la siguiente tabla se detallan las distintas posibilidades. La prioridad se

##### utiliza si se envían varios parámetros, en este caso el sistema dará más importancia a los

##### parámetros de prioridad alta.

#### Parametros:

##### Parámetro Descripción Prioridad

```
cod_cli Código único del propietario en cuestión. Alta
cod_ofer Código único de la propiedad de la que se quiere obtener elpropietario. Media
```
```
ref Puede solicitarse con la referencia de la propiedad de la que sequiere obtener el propietario. Baja
```
#### Respuesta:

##### HTTP/1.0 200 OK

##### {

##### "cod_cli": "13449756",

##### "nombre": "Pedro",

##### "apellidos": "Picapiedra",

##### "nif": "Z7347280G",

##### "email": "pedro@picapiedra.com",

##### "calle": "Av. Libertad",

##### "numero": "123",

##### "planta": "3",

##### "puerta": "der",

##### "escalera": "3",

##### "cp": "03201",

##### "localidad": "Elche",

##### "provincia": "Alicante",

##### "pais": "España",

##### "nacionalidad": "Española",

##### "telefono1": "666554433",

##### "telefono2": "666221100",

##### "telefono3": "",

##### "fechanacimiento": null,

##### "altacliente": "2018-03-01 12:53:25",

##### "facebook": null,

##### "conyuge": "Vilma Picapiedra",

##### "conemail": "vilma@picapiedra.com",

##### "connif": "Y4752447V",

##### "propiedades": [

##### {

##### "cod_ofer": "5288705",

##### "ref": "00633",


```
 
```
##### "panel": "https:/www.haypisos.com/cliente/?cliente=01413_3

##### "estadistica": "https:/www.haypisos.com/cliente/?estadisti

##### "disponible": true

##### },

##### {

##### "cod_ofer": "5426130",

##### "ref": "13748578",

##### "panel": "https:/www.haypisos.com/cliente/?cliente=01413_0

##### "estadistica": "https:/www.haypisos.com/cliente/?estadisti

##### "disponible": false

##### },

##### ...

##### }

### Crear Propietario POST

##### /propietarios/

##### Para crear un propietario es requerido enviar el código (cod_ofer) de la propiedad

##### relacionada.

#### Petición:

##### {

##### "nombre": "Pedro",

##### "apellidos": "Picapiedra",

##### "nif": "12345678K",

##### "email": "pedro.picapiedra@inmovilla.com",

##### "telefono1": 666554433,

##### "telefono2": 666221100,

##### "telefono2": 666001122,

##### "cod_ofer": 12345678

##### }

#### Respuesta:

##### HTTP/1.0 201 Created

##### {

##### "cod_cli":11223344,

##### "codigo": 201,

##### "mensaje": "Propietario creado y vinculado a la propiedad con cod_


```
 
```
```
 
```
##### }

### Editar Propietario PUT

##### /propietarios/

##### Para editar/actualizar un propietario es obligatorio enviar el código del mismo (cod_cli).

##### Sólo debe enviarse los campos que se van a modificar o añadir, en el ejemplo siguiente

##### actualizaremos la dirección de email.

#### Petición:

##### {

##### "cod_cli": 11223344,

##### "email": "pedro.picapiedra.gomez@inmovilla.com"

##### }

#### Respuesta:

##### HTTP/1.0 202 Accepted

##### {

##### "cod_cli":11223344,

##### "codigo": 202,

##### "mensaje": "Propietario actualizado"

##### }

### Eliminar Propietario DELETE

##### /propietarios/{cod_cli}

##### Para eliminar un propietario tan sólo es necesario hacer la petición DELETE a la url de

##### propietarios con el identificador del mismo (cod_cli). El sistema avisará si dicho

##### propietario está vinculado con alguna propiedad o demanda, en dicho caso no se eliminará

##### el propietario, ya que antes habrá que desvincularlo.


#### Respuesta:

##### HTTP/1.0 200 OK

##### {

##### "codigo": 200,

##### "mensaje": "Propietario eliminado"

##### }

#### Campos:

##### Campo Tipo Descripción Requerido en

```
cod_cli numérico Identificador único GET PUT DELETE
cod_ofer numérico Identificador único de la propiedadvinculada POST
nombre texto Nombre del propietario POST
apellidos texto Apellidos del propietario
nif texto NIF / DNI / CIF
email texto Dirección de Email / Correo electrónico
calle texto Nombre de la dirección del propietario
numero texto Número de la dirección del propietario
planta numérico Nº de planta de la dirección delpropietario
puerta texto Puerta de la dirección del propietario
escalera texto Escalera de la dirección del propietario
cp texto Código Postal
localidad texto Localidad / Ciudad
provincia texto Provincia
pais texto Pais del propietario
nacionalidad texto Nacionalidad
telefono1 numérico Teléfono principal
prefijotel1 numérico Prefijo teléfono fijo
prefijotel2 numérico Prefijo teléfono móvil
telefono2 numérico Otro teléfono
```

##### Campo Tipo Descripción Requerido en

```
telefono3 numérico Otro teléfono
prefijotel3 numérico Prefijo otro teléfono
fechanacimiento fecha Fecha de Nacimiento (Formato 1984-09-05 23:25:00)
altacliente fecha Fecha de alta del propietario
conyuge texto Nombre del Cónyuge
conemail texto Dirección de Email del Cónyuge
connif texto NIF del Cónyuge
observacion texto Observaciones
nonewsletters numérico Newsletters: 0 Pendiente - 3 ValidadoOficina - 1 Rechazado - 6 Fallo Entrega
```
```
gesauto numérico
```
```
Envío de prop. por email: 0 Pendiente -
2 Validado Oficina - 4 Rechazado - 5
Validado Portal - 6 Fallo Entrega
```
```
rgpdwhats numérico
```
```
Envío de prop. por Whatsapp: 0
Pendiente - 2 Validado Oficina - 4
Rechazado - 5 Validado Portal - 6 Fallo
Entrega
```
#### Posibles errores:

##### Error Código Error Descripción

```
400 400001 Petición Errónea Petición mal formada, comprueba que elcontenido ha sido bien parseado.
400 400002 Petición Errónea No se han enviado parámetros.
400 400003 Error al guardar Ha ocurrido un error al crear, editar o eliminarel propietario
```
```
404 404001 Sin resultados No existe ninguna propiedad con elidentificador solicitado.
```
```
405 405001 Método no permitido El método solicitado no está disponible (GET,POST, PUT, DELETE, etc.)
```
```
406 406001 Campo {x} requerido El campo {x} es obligatorio y no ha sidoenviado.
406 406002 Campo {x} no válido El campo {x} no es válido o está mal escrito.
406 406004 Propietario vinculado El propietario tiene algún vínculo y no se puedeeliminar
406 406006 Código no existe El código {x} facilitado no existe
408 408 Demasiadas peticiones Límite de 20 peticiones de propietarios cadaminuto
```

## Límites por tipo de petición

##### Todo tipo de petición tiene asignado un límite de peticiones por intervalo de tiempo para no

##### saturar al servidor y así poder ofrecer a los clientes un tiempo de respuesta correcto en

##### cada una de ellas. A continuación, dispones de una tabla donde se indican estos límites

##### para que vuestros scripts los tengan en cuenta.

#### Tabla de límites:

##### Tipo Intervalo PeticionesMax. Tipo Error

```
enums Cada minuto 2 Cod. 408
enums Cada 10 minutos 10 Cod. 408
clientes Cada minuto 20 Cod. 408
clientes Cada 10 minutos 100 Cod. 408
propiedades Cada minuto 10 Cod. 408
propiedades Cada 10 minutos 50 Cod. 408
propietarios Cada minuto 20 Cod. 408
propietarios Cada 10 minutos 100 Cod. 408
```

