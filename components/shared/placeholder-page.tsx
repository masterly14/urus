import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

interface PlaceholderPageProps {
    title: string;
    description: string;
    section: string;
}

export function PlaceholderPage({ title, description, section }: PlaceholderPageProps) {
    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                <Badge variant="outline" className="text-xs gap-1">
                    <Construction className="h-3 w-3" />
                    En construcción
                </Badge>
            </div>
            <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="rounded-full bg-accent/50 p-4 mb-4">
                        <Construction className="h-8 w-8 text-secondary" />
                    </div>
                    <h2 className="text-lg font-semibold mb-2">{section}</h2>
                    <p className="text-sm text-muted-foreground max-w-md">{description}</p>
                </CardContent>
            </Card>
        </div>
    );
}
