import Link from "next/link";
import {
  LayoutDashboard,
  PieChart,
  FileText,
  Users,
  DollarSign,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const quickLinks = [
  {
    title: "Inteligencia de Negocio",
    description: "Visión ejecutiva, financiero y operativo",
    href: "/platform/bi/vision-ejecutiva",
    icon: PieChart,
  },
  {
    title: "Legal",
    description: "Contratos y plantillas",
    href: "/platform/legal/contratos",
    icon: FileText,
  },
  {
    title: "Colaboradores",
    description: "Vista general y rankings",
    href: "/platform/colaboradores",
    icon: Users,
  },
  {
    title: "Smart Pricing",
    description: "Semáforo y mercado",
    href: "/platform/pricing",
    icon: DollarSign,
  },
];

export default function PlatformHomePage() {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <LayoutDashboard className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Panel</h1>
          <p className="text-sm text-muted-foreground">
            Accesos rápidos a los módulos de la plataforma
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {quickLinks.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}>
              <Card className="h-full transition-colors hover:bg-accent/40 hover:border-primary/30">
                <CardHeader className="pb-2">
                  <Icon className="h-6 w-6 text-primary" />
                  <CardTitle className="text-base">{item.title}</CardTitle>
                  <CardDescription className="text-xs">{item.description}</CardDescription>
                </CardHeader>
                <CardContent />
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
