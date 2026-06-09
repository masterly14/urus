const NOTA_ENCARGO_MAX_FUTURE_DAYS = Number(
  process.env.NOTA_ENCARGO_MAX_FUTURE_DAYS || "180",
);

export type NotaEncargoVisitDateTimeError = {
  error: string;
  status: 400;
};

export function startOfTodayMadrid(): Date {
  const now = new Date();
  const madridStr = now.toLocaleDateString("en-CA", {
    timeZone: "Europe/Madrid",
  });
  return new Date(`${madridStr}T00:00:00+02:00`);
}

export function validateNotaEncargoVisitDateTime(
  visitDate: Date,
  now: Date = new Date(),
): NotaEncargoVisitDateTimeError | null {
  if (visitDate.getTime() <= now.getTime()) {
    return {
      error: "La fecha de visita debe estar en el futuro",
      status: 400,
    };
  }

  if (visitDate < startOfTodayMadrid()) {
    return {
      error: "La fecha de visita no puede ser anterior a hoy",
      status: 400,
    };
  }

  const maxFutureMs = NOTA_ENCARGO_MAX_FUTURE_DAYS * 24 * 60 * 60 * 1000;
  if (visitDate.getTime() > now.getTime() + maxFutureMs) {
    return {
      error: `La fecha de visita no puede ser más de ${NOTA_ENCARGO_MAX_FUTURE_DAYS} días en el futuro`,
      status: 400,
    };
  }

  return null;
}

export { NOTA_ENCARGO_MAX_FUTURE_DAYS };
