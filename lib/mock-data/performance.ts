export type Archetype = "Top Performer" | "Productivo Ineficiente" | "Dependiente del Lead" | "Bajo Rendimiento";

export interface TeamMember {
    id: string;
    name: string;
    zone: string;
    avatar?: string;
    role: string;
    archetype: Archetype;
    metrics: {
        leads: number;
        visits: number;
        closings: number;
        revenue: number;
        conversion: number; // %
        activityScore: number; // 0-100
    };
    trend: number[]; // Last 6 weeks revenue
    history: {
        week: number;
        revenue: number;
        leads: number;
    }[];
}

export interface PerformanceAlert {
    id: string;
    agentId: string;
    agentName: string;
    type: "drop" | "opportunity_cost" | "anomaly";
    severity: "low" | "medium" | "high";
    message: string;
    impact: string;
    date: string;
}

export const teamMembers: TeamMember[] = [
    {
        id: "tm-1",
        name: "Ana García",
        zone: "Valencia Centro",
        role: "Senior Agent",
        archetype: "Top Performer",
        metrics: {
            leads: 45,
            visits: 28,
            closings: 8,
            revenue: 185000,
            conversion: 17.7,
            activityScore: 92,
        },
        trend: [15000, 18000, 22000, 20000, 25000, 28000],
        history: Array.from({ length: 12 }, (_, i) => ({ week: i + 1, revenue: 15000 + Math.random() * 10000, leads: 10 + Math.random() * 5 })),
    },
    {
        id: "tm-2",
        name: "Carlos Ruiz",
        zone: "Madrid Salamanca",
        role: "Agent",
        archetype: "Productivo Ineficiente",
        metrics: {
            leads: 60,
            visits: 45,
            closings: 5,
            revenue: 140000,
            conversion: 8.3,
            activityScore: 98,
        },
        trend: [12000, 14000, 13000, 11000, 15000, 14000],
        history: Array.from({ length: 12 }, (_, i) => ({ week: i + 1, revenue: 10000 + Math.random() * 8000, leads: 15 + Math.random() * 8 })),
    },
    {
        id: "tm-3",
        name: "Laura Menéndez",
        zone: "Valencia Playa",
        role: "Agent",
        archetype: "Dependiente del Lead",
        metrics: {
            leads: 30,
            visits: 12,
            closings: 6,
            revenue: 155000,
            conversion: 20.0,
            activityScore: 65,
        },
        trend: [18000, 12000, 25000, 10000, 22000, 15000],
        history: Array.from({ length: 12 }, (_, i) => ({ week: i + 1, revenue: 8000 + Math.random() * 15000, leads: 5 + Math.random() * 5 })),
    },
    {
        id: "tm-4",
        name: "David Torres",
        zone: "Barcelona Eixample",
        role: "Junior Agent",
        archetype: "Bajo Rendimiento",
        metrics: {
            leads: 55,
            visits: 30,
            closings: 3,
            revenue: 95000,
            conversion: 5.4,
            activityScore: 70,
        },
        trend: [8000, 7500, 9000, 6000, 7000, 8000],
        history: Array.from({ length: 12 }, (_, i) => ({ week: i + 1, revenue: 5000 + Math.random() * 4000, leads: 8 + Math.random() * 6 })),
    },
    {
        id: "tm-5",
        name: "Elena Pastor",
        zone: "Madrid Centro",
        role: "Senior Agent",
        archetype: "Top Performer",
        metrics: {
            leads: 40,
            visits: 25,
            closings: 7,
            revenue: 210000,
            conversion: 17.5,
            activityScore: 95,
        },
        trend: [18000, 21000, 24000, 26000, 28000, 32000],
        history: Array.from({ length: 12 }, (_, i) => ({ week: i + 1, revenue: 18000 + Math.random() * 12000, leads: 8 + Math.random() * 6 })),
    },
];

export const performanceAlerts: PerformanceAlert[] = [
    {
        id: "alt-1",
        agentId: "tm-1",
        agentName: "Ana García",
        type: "drop",
        severity: "medium",
        message: "Caída de rendimiento sostenida (2 semanas)",
        impact: "-15% facturación vs media",
        date: "2026-02-12",
    },
    {
        id: "alt-2",
        agentId: "tm-2",
        agentName: "Carlos Ruiz",
        type: "opportunity_cost",
        severity: "high",
        message: "Alta actividad / Baja conversión",
        impact: "€45k perdidos en leads no cerrados",
        date: "2026-02-10",
    },
    {
        id: "alt-3",
        agentId: "tm-4",
        agentName: "David Torres",
        type: "anomaly",
        severity: "high",
        message: "Bajo rendimiento estructural detectado",
        impact: "Coste operativo supera ingresos generados",
        date: "2026-02-08",
    },
];

export const archetypeConfig: Record<Archetype, { color: string; description: string; action: string }> = {
    "Top Performer": {
        color: "#10b981", // Green
        description: "Alta conversión + Alta actividad",
        action: "Retener y clonar métodos",
    },
    "Productivo Ineficiente": {
        color: "#3b82f6", // Blue
        description: "Mucha actividad, poco cierre",
        action: "Capacitación en cierre",
    },
    "Dependiente del Lead": {
        color: "#f59e0b", // Yellow
        description: "Cierra fácil, poca prospección",
        action: "Aumentar cuota actividad",
    },
    "Bajo Rendimiento": {
        color: "#ef4444", // Red
        description: "Baja conversión y actividad",
        action: "Plan de mejora o despido",
    },
};
