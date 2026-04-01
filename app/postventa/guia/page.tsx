import {
  Zap,
  MapPin,
  Receipt,
  ShieldCheck,
  Phone,
} from "lucide-react";

const sections = [
  {
    icon: Zap,
    title: "Cambio de suministros",
    items: [
      "Contacta con tu compañía eléctrica para cambiar la titularidad del contrato de luz.",
      "Haz lo mismo con el suministro de agua — normalmente se gestiona en la oficina del ayuntamiento o empresa municipal.",
      "Si la vivienda tiene gas natural, llama a tu distribuidora para el cambio de titular y solicitar la revisión obligatoria.",
    ],
  },
  {
    icon: MapPin,
    title: "Empadronamiento",
    items: [
      "Acude al ayuntamiento de tu nuevo municipio con tu DNI/NIE y el contrato o escritura de la vivienda.",
      "Solicita el alta en el padrón municipal — necesario para tarjeta sanitaria, colegio y otros trámites.",
      "Plazo recomendado: dentro de los primeros 15 días tras la mudanza.",
    ],
  },
  {
    icon: Receipt,
    title: "IBI y comunidad de vecinos",
    items: [
      "El IBI (Impuesto sobre Bienes Inmuebles) se domicilia en la cuenta del nuevo propietario desde el siguiente ejercicio fiscal.",
      "Solicita al vendedor o al administrador de la finca los datos de contacto de la comunidad de vecinos.",
      "Pide que te pasen el acta de la última junta y el estado de las cuotas pendientes.",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Seguro del hogar",
    items: [
      "Si la vivienda tiene hipoteca, el seguro de hogar es obligatorio — compara opciones antes de contratar.",
      "Aunque no tengas hipoteca, un seguro de hogar protege ante daños por agua, incendio y responsabilidad civil.",
      "Asegúrate de tener cobertura desde el día de la entrega de llaves.",
    ],
  },
  {
    icon: Phone,
    title: "¿Necesitas ayuda?",
    items: [
      "Si tienes cualquier duda sobre estos trámites, responde al mensaje de WhatsApp que te enviamos.",
      "Tu agente está disponible para ayudarte durante las primeras semanas.",
    ],
  },
];

export default function GuiaPostventaPage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <header className="border-b border-neutral-800">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="text-sm text-neutral-400">Urus Capital Group</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Guía práctica post-compra
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Todo lo que necesitas saber para los primeros días en tu nueva vivienda.
          </p>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-10 space-y-8">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <article
              key={section.title}
              className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-800">
                  <Icon className="h-5 w-5 text-neutral-300" />
                </div>
                <h2 className="text-lg font-semibold">{section.title}</h2>
              </div>
              <ul className="space-y-3">
                {section.items.map((item, i) => (
                  <li
                    key={i}
                    className="flex gap-3 text-sm text-neutral-300 leading-relaxed"
                  >
                    <span className="mt-1 block h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-600" />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </section>

      <footer className="border-t border-neutral-800 py-6 text-center text-xs text-neutral-500">
        Urus Capital Group
      </footer>
    </main>
  );
}
