import { Suspense } from "react";
import { VisitasClient } from "./visitas-client";

export default function VisitasPage() {
  return (
    <Suspense fallback={null}>
      <VisitasClient />
    </Suspense>
  );
}
