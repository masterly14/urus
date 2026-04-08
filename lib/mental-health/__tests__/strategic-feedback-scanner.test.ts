import { describe, expect, it } from "vitest";
import {
  aggregateMentalEventsByWaId,
  buildCandidatesFromAggregates,
  mergeWaAggregatesByComercialId,
  type MentalStrategicAlertConfig,
  type WaAggregate,
} from "../strategic-feedback-scanner";

const defaultConfig: MentalStrategicAlertConfig = {
  windowDays: 7,
  deduplicationWindowDays: 7,
  minClassifiedCoachReplies: 4,
  energyAvgThreshold: 2.25,
  energyAvgCriticalThreshold: 1.75,
  minBloqueoHits: 3,
  bloqueoHitsMedium: 5,
  bloqueoHitsHigh: 8,
  inboundHigh: 28,
  inboundCritical: 45,
};

describe("aggregateMentalEventsByWaId", () => {
  it("cuenta mensajes entrantes y clasificaciones del coach sin texto", () => {
    const rows = [
      {
        aggregateId: "34600111222",
        type: "MENTAL_MSG_RECIBIDO",
        payload: { text: "secreto", comercialId: "c1" },
      },
      {
        aggregateId: "34600111222",
        type: "MENTAL_MSG_ENVIADO",
        payload: {
          classification: { flujo: "bloqueo", nivelEnergia: 2 },
          comercialId: "c1",
        },
      },
      {
        aggregateId: "34600111222",
        type: "MENTAL_MSG_ENVIADO",
        payload: { isWelcome: true, text: "hola" },
      },
    ];

    const map = aggregateMentalEventsByWaId(rows);
    const agg = map.get("34600111222");
    expect(agg).toBeDefined();
    expect(agg!.inboundCount).toBe(1);
    expect(agg!.comercialId).toBe("c1");
    expect(agg!.classifiedFromCoach).toEqual([
      { flujo: "bloqueo", nivelEnergia: 2 },
    ]);
  });
});

describe("mergeWaAggregatesByComercialId", () => {
  it("suma dos waId del mismo comercial", () => {
    const byWa = new Map<string, WaAggregate>([
      [
        "wa1",
        {
          waId: "wa1",
          comercialId: "c1",
          inboundCount: 10,
          classifiedFromCoach: [
            { flujo: "bloqueo", nivelEnergia: 2 },
            { flujo: "enfoque", nivelEnergia: 3 },
          ],
        },
      ],
      [
        "wa2",
        {
          waId: "wa2",
          comercialId: "c1",
          inboundCount: 5,
          classifiedFromCoach: [{ flujo: "bloqueo", nivelEnergia: 2 }],
        },
      ],
    ]);

    const merged = mergeWaAggregatesByComercialId(byWa);
    const one = merged.get("c1");
    expect(one!.inboundCount).toBe(15);
    expect(one!.classifiedFromCoach).toHaveLength(3);
  });
});

describe("buildCandidatesFromAggregates", () => {
  it("genera alerta de energía baja con media bajo umbral", () => {
    const names = new Map([["c1", "Ana"]]);
    const aggregates: WaAggregate[] = [
      {
        waId: "x",
        comercialId: "c1",
        inboundCount: 2,
        classifiedFromCoach: [
          { flujo: "preparacion", nivelEnergia: 2 },
          { flujo: "preparacion", nivelEnergia: 2 },
          { flujo: "preparacion", nivelEnergia: 2 },
          { flujo: "preparacion", nivelEnergia: 2 },
        ],
      },
    ];

    const alerts = buildCandidatesFromAggregates(
      aggregates,
      names,
      defaultConfig,
    );
    const energy = alerts.find((a) => a.type === "mh_energy_low");
    expect(energy).toBeDefined();
    expect(energy!.severity).toBe("medium");
    expect(energy!.message).not.toMatch(/secreto/i);
  });

  it("genera alerta de bloqueo recurrente", () => {
    const names = new Map([["c1", "Luis"]]);
    const aggregates: WaAggregate[] = [
      {
        waId: "x",
        comercialId: "c1",
        inboundCount: 1,
        classifiedFromCoach: [
          { flujo: "bloqueo", nivelEnergia: 3 },
          { flujo: "bloqueo", nivelEnergia: 3 },
          { flujo: "bloqueo", nivelEnergia: 3 },
        ],
      },
    ];

    const alerts = buildCandidatesFromAggregates(
      aggregates,
      names,
      defaultConfig,
    );
    expect(alerts.some((a) => a.type === "mh_bloqueo_recurrente")).toBe(true);
  });

  it("genera alerta de sobrecarga por mensajes entrantes", () => {
    const names = new Map([["c1", "Bea"]]);
    const aggregates: WaAggregate[] = [
      {
        waId: "x",
        comercialId: "c1",
        inboundCount: 30,
        classifiedFromCoach: [],
      },
    ];

    const alerts = buildCandidatesFromAggregates(
      aggregates,
      names,
      defaultConfig,
    );
    const s = alerts.find((a) => a.type === "mh_sobrecarga_uso");
    expect(s).toBeDefined();
    expect(s!.severity).toBe("medium");
  });
});
