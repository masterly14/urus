"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const ESTADOS_ACTIVOS = [
  { name: "En curso", meaning: "Acabas de abrir la operacion. Todavia no hay oferta formal." },
  { name: "Oferta firme", meaning: "El comprador ha hecho una oferta en firme por la propiedad." },
  { name: "Reserva", meaning: "Se ha formalizado reserva o senal de compra (el comprador ha entregado una cantidad inicial)." },
  { name: "Arras", meaning: "Se ha firmado el contrato de arras (pago mayor, compromiso mas fuerte)." },
  { name: "Pendiente de firma", meaning: "Solo falta firmar la escritura o contrato final. La operacion esta a punto de cerrarse." },
];

const ESTADOS_FINALES = [
  { name: "Cerrada (venta)", meaning: "La propiedad se vendio." },
  { name: "Cerrada (alquiler)", meaning: "La propiedad se alquilo." },
  { name: "Cerrada (traspaso)", meaning: "Se hizo un traspaso." },
  { name: "Cancelada", meaning: "La operacion se cayo y no se va a cerrar." },
];

export function OperacionesGuiaDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[min(96vw,80rem)] sm:max-w-[min(96vw,80rem)]">
        <DialogHeader>
          <DialogTitle>Guia rapida de Operaciones</DialogTitle>
          <DialogDescription>
            Como funciona el cierre de tus ventas, que significa cada estado y que hace Urus por ti.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-3">
          <div className="space-y-5 text-sm">
            <section className="rounded-lg border border-border/60 bg-card/40 p-4">
              <h3 className="font-semibold">Que es crear una operacion</h3>
              <p className="mt-2 text-muted-foreground">
                Una operacion es el expediente de una venta concreta. Al crearla, arranca en estado
                <span className="mx-1 font-medium text-foreground">En curso</span>
                y centraliza todo lo relevante: avances de estado, cierre, notas internas, lista de
                tareas, archivos y contratos generados.
              </p>
              <p className="mt-2 text-muted-foreground">
                Solo puede haber una operacion activa por propiedad. Si ya hay una abierta, primero hay
                que cerrarla o cancelarla antes de crear otra.
              </p>
            </section>

            <section>
              <h3 className="font-semibold">Estados activos (la operacion sigue viva)</h3>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                {ESTADOS_ACTIVOS.map((estado) => (
                  <div key={estado.name} className="rounded-md border border-border/50 p-3">
                    <p className="font-medium text-foreground">{estado.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{estado.meaning}</p>
                  </div>
                ))}
              </div>

              <h3 className="font-semibold mt-4">Estados finales (la operacion ha terminado)</h3>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                {ESTADOS_FINALES.map((estado) => (
                  <div key={estado.name} className="rounded-md border border-border/50 p-3">
                    <p className="font-medium text-foreground">{estado.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{estado.meaning}</p>
                  </div>
                ))}
              </div>
            </section>

            <Separator />

            <section className="rounded-lg border border-border/60 bg-card/40 p-4">
              <h3 className="font-semibold">Avanzar de estado (normal o saltando etapas)</h3>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                <li>- Puedes avanzar al siguiente estado o saltar fases intermedias (avance forzado).</li>
                <li>- Solo se permite avanzar hacia adelante. No se puede volver atras.</li>
                <li>- No se puede avanzar una operacion que ya este cerrada o cancelada.</li>
                <li>- Si el estado destino necesita contrato, el sistema comprobara que tiene los datos
                minimos (nombre, DNI, precio, importe de la senal, IBAN, etc.) y te los pedira si faltan.</li>
              </ul>
            </section>

            <section className="rounded-lg border border-border/60 bg-card/40 p-4">
              <h3 className="font-semibold">Que pasa cuando cierras una operacion</h3>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                <li>- Urus guarda la fecha y el tipo de cierre (venta, alquiler o traspaso).</li>
                <li>- Queda registrado en el historial de la operacion.</li>
                <li>- La demanda del cliente se marca como cerrada internamente.</li>
                <li>- Urus actualiza automaticamente la propiedad en Inmovilla.</li>
                <li>- Si hay demanda asociada, Urus la da de baja en Inmovilla.</li>
                <li>- Arrancan los mensajes automaticos al cliente (agradecimiento, encuesta, recordatorios).</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold">Relacion con Inmovilla</h3>
              <div className="mt-2 text-muted-foreground space-y-2">
                <p>
                  Inmovilla es el programa donde estan registradas las propiedades, los clientes y las
                  demandas. Antes, cerrar una operacion implicaba entrar a Inmovilla a cambiar el estado
                  de la propiedad y tocar la demanda del cliente. Ahora ese trabajo lo hace Urus por ti.
                </p>
                <ul className="space-y-1">
                  <li>- Al cerrar en Urus, la propiedad queda marcada en Inmovilla como vendida, alquilada o traspasada.</li>
                  <li>- Si hay demanda asociada, Urus la pasa a cerrada en Inmovilla para que no siga recibiendo cruces.</li>
                  <li>- Si es posible, Urus vincula al comprador con la propiedad en Inmovilla.</li>
                  <li>- Todo pasa en segundo plano, sin bloquear tu pantalla.</li>
                </ul>
              </div>
            </section>

            <section className="rounded-lg border border-border/60 bg-card/40 p-4">
              <h3 className="font-semibold">Cancelar no es lo mismo que cerrar</h3>
              <p className="mt-2 text-muted-foreground">
                <span className="text-foreground font-medium">Cerrar</span> es "hubo venta, alquiler o
                traspaso". <span className="text-foreground font-medium">Cancelar</span> es "la
                operacion se cayo, no hubo firma". Si la operacion se cancela, no se hacen cambios en
                Inmovilla y no se envian mensajes automaticos al cliente.
              </p>
            </section>

            <section className="rounded-lg border border-border/60 bg-card/40 p-4">
              <h3 className="font-semibold">Preguntas frecuentes</h3>
              <div className="mt-2 space-y-2 text-muted-foreground">
                <p>
                  <span className="text-foreground font-medium">Tengo que cerrar tambien en Inmovilla?</span> No.
                  Urus actualiza la propiedad y la demanda en Inmovilla automaticamente al cerrar aqui.
                </p>
                <p>
                  <span className="text-foreground font-medium">Puedo cerrar sin comprador asociado?</span> Si, se
                  permite. Aunque es mejor asociarlo para que quede vinculado a la propiedad en Inmovilla.
                </p>
                <p>
                  <span className="text-foreground font-medium">Que hago si faltan datos para el contrato?</span> El
                  sistema te señala los campos que faltan, los rellenas ahi mismo y reintentas.
                </p>
                <p>
                  <span className="text-foreground font-medium">Donde dejo seguimiento interno?</span> En el detalle
                  de la operacion: Notas, Lista de tareas y Archivos adjuntos.
                </p>
              </div>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
