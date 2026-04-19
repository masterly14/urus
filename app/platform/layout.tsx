import { AppShell } from "@/components/layout/app-shell";

export default function PlatformLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AppShell logoSrc="/image.png">{children}</AppShell>;
}
