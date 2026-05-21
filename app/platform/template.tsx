"use client";

import { FadeIn } from "@/components/ui/motion";

export default function PlatformTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FadeIn className="h-full w-full">
      {children}
    </FadeIn>
  );
}