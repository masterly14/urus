export interface FinancialMetric {
    period: string;
    revenue: number;
    ebitda: number;
    cashFlow: number;
    operatingCost: number;
    targetRevenue: number;
}

export interface SalesPerformance {
    agentId: string;
    agentName: string;
    city: string;
    leads: number;
    conversions: number;
    revenue: number;
    avgTicket: number;
    efficiency: number; // 0-100
}

export interface MarketingCampaign {
    id: string;
    name: string;
    channel: "Google" | "Facebook" | "Instagram" | "LinkedIn" | "Email" | "Organic";
    spend: number;
    leads: number;
    cpl: number; // Cost per Lead
    roi: number; // Return on Investment %
    status: "active" | "paused" | "completed";
}

export interface HumanCapitalRisk {
    zone: string;
    pressureLevel: number; // 0-100
    burnoutRisk: "Low" | "Medium" | "High" | "Critical";
    activeAgents: number;
    avgHours: number;
}

export const financialData: FinancialMetric[] = [
    { period: "Ene", revenue: 120000, ebitda: 35000, cashFlow: 28000, operatingCost: 85000, targetRevenue: 110000 },
    { period: "Feb", revenue: 135000, ebitda: 42000, cashFlow: 35000, operatingCost: 93000, targetRevenue: 115000 },
    { period: "Mar", revenue: 128000, ebitda: 38000, cashFlow: 30000, operatingCost: 90000, targetRevenue: 120000 },
    { period: "Abr", revenue: 145000, ebitda: 48000, cashFlow: 40000, operatingCost: 97000, targetRevenue: 125000 },
    { period: "May", revenue: 160000, ebitda: 55000, cashFlow: 48000, operatingCost: 105000, targetRevenue: 130000 },
    { period: "Jun", revenue: 155000, ebitda: 52000, cashFlow: 45000, operatingCost: 103000, targetRevenue: 135000 },
];

export const salesPerformanceData: SalesPerformance[] = [
    { agentId: "AG01", agentName: "Ana García", city: "Valencia", leads: 45, conversions: 8, revenue: 185000, avgTicket: 23125, efficiency: 92 },
    { agentId: "AG02", agentName: "Carlos Ruiz", city: "Madrid", leads: 60, conversions: 5, revenue: 140000, avgTicket: 28000, efficiency: 75 },
    { agentId: "AG03", agentName: "Laura Menéndez", city: "Valencia", leads: 30, conversions: 6, revenue: 155000, avgTicket: 25833, efficiency: 88 },
    { agentId: "AG04", agentName: "David Torres", city: "Barcelona", leads: 55, conversions: 3, revenue: 95000, avgTicket: 31666, efficiency: 60 },
    { agentId: "AG05", agentName: "Elena Pastor", city: "Madrid", leads: 40, conversions: 7, revenue: 210000, avgTicket: 30000, efficiency: 95 },
];

export const marketingCampaigns: MarketingCampaign[] = [
    { id: "CMP-001", name: "Spring Luxury Promo", channel: "Instagram", spend: 1200, leads: 85, cpl: 14.11, roi: 320, status: "active" },
    { id: "CMP-002", name: "Search - Valencia Centro", channel: "Google", spend: 2500, leads: 110, cpl: 22.72, roi: 280, status: "active" },
    { id: "CMP-003", name: "LinkedIn Investors", channel: "LinkedIn", spend: 1800, leads: 25, cpl: 72.00, roi: 450, status: "paused" },
    { id: "CMP-004", name: "Email Newsletter Q1", channel: "Email", spend: 300, leads: 45, cpl: 6.66, roi: 800, status: "completed" },
];

export const humanCapitalRisks: HumanCapitalRisk[] = [
    { zone: "Valencia Centro", pressureLevel: 85, burnoutRisk: "High", activeAgents: 12, avgHours: 52 },
    { zone: "Madrid Salamanca", pressureLevel: 92, burnoutRisk: "Critical", activeAgents: 8, avgHours: 58 },
    { zone: "Barcelona Eixample", pressureLevel: 65, burnoutRisk: "Medium", activeAgents: 10, avgHours: 42 },
    { zone: "Valencia Playa", pressureLevel: 40, burnoutRisk: "Low", activeAgents: 6, avgHours: 38 },
];
