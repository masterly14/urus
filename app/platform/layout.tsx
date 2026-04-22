import { AppShell } from "@/components/layout/app-shell";
import { SWRProvider } from "@/lib/swr/provider";

export default function PlatformLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AppShell logoSrc="/image.png">
      <SWRProvider>{children}</SWRProvider>
    </AppShell>
  );
}
