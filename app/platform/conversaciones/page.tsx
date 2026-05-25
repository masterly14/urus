import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { ConversationsClient } from "./conversations-client";

export default function ConversacionesPage() {
  return (
    <Suspense
      fallback={(
        <div className="flex h-[50vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Cargando conversaciones...</p>
          </div>
        </div>
      )}
    >
      <ConversationsClient />
    </Suspense>
  );
}

