import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const getCachedUsers = unstable_cache(
  () =>
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        comercialId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ["users-list"],
  { revalidate: 300, tags: ["users-list"] },
);

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
  }

  const userRole = session.user.role;
  if (userRole !== "ceo" && userRole !== "admin") {
    return NextResponse.json({ ok: false, error: "Sin permisos" }, { status: 403 });
  }

  const users = await getCachedUsers();

  return NextResponse.json({ ok: true, users });
}
