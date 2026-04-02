import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySigningToken } from "@/lib/firma/token";
import { verifyOtp } from "@/lib/firma/otp";

export const runtime = "nodejs";

const BodySchema = z.object({
  otpId: z.string().min(1),
  code: z.string().length(6),
});

/**
 * POST /api/firma/{token}/otp/verify
 * Verifica el código OTP ingresado por el firmante.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!verifySigningToken(token)) {
    return NextResponse.json({ error: "Token inválido" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Se requiere otpId y un código de 6 dígitos" },
      { status: 400 },
    );
  }

  const { otpId, code } = parsed.data;
  const result = await verifyOtp(otpId, code);

  if (result.verified) {
    return NextResponse.json({ verified: true, otpId });
  }

  const status = result.attemptsLeft <= 0 ? 429 : 400;
  return NextResponse.json(
    { verified: false, error: result.error, attemptsLeft: result.attemptsLeft },
    { status },
  );
}
