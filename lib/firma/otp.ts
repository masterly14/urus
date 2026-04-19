import { createHash, randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getObservabilityContext } from "@/lib/observability/context";
import { createLogger } from "@/lib/observability/logger";
import { maskPhone } from "./mask-phone";
import { sendOtpSms } from "./vonage";

const OTP_LENGTH = 6;
const OTP_EXPIRY_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 3;

function generateOtpCode(): string {
  const min = Math.pow(10, OTP_LENGTH - 1);
  const max = Math.pow(10, OTP_LENGTH);
  return String(randomInt(min, max));
}

function hashOtpCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function otpDebugLogger() {
  const ctx = getObservabilityContext();
  if (ctx) {
    return createLogger(ctx).child({ operation: `${ctx.operation} › otp` });
  }
  return createLogger({
    scope: "api",
    source: "api",
    operation: "firma/otp",
  });
}

export interface CreateOtpResult {
  otpId: string;
  phoneMasked: string;
}

export async function createOtp(
  signatureRequestId: string,
  phone: string,
): Promise<CreateOtpResult> {
  const code = generateOtpCode();
  const codeHash = hashOtpCode(code);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

  const otp = await prisma.signatureOtp.create({
    data: {
      signatureRequestId,
      phone,
      codeHash,
      expiresAt,
    },
  });

  const log = otpDebugLogger();
  log.info("OTP persistido en BD; inicio envío SMS", {
    signatureRequestId,
    otpId: otp.id,
    phoneMasked: maskPhone(phone),
    expiresAt: expiresAt.toISOString(),
  });

  try {
    await sendOtpSms(phone, code);
  } catch (err) {
    log.error(
      "Fallo al enviar SMS (Vonage); el OTP ya está guardado — reintentar puede crear otro registro",
      err,
      {
        signatureRequestId,
        otpId: otp.id,
        phoneMasked: maskPhone(phone),
      },
    );
    throw err;
  }

  log.info("OTP enviado por SMS correctamente", {
    signatureRequestId,
    otpId: otp.id,
    phoneMasked: maskPhone(phone),
  });

  return {
    otpId: otp.id,
    phoneMasked: maskPhone(phone),
  };
}

export type VerifyOtpResult =
  | { verified: true }
  | { verified: false; error: string; attemptsLeft: number };

export async function verifyOtp(
  otpId: string,
  code: string,
): Promise<VerifyOtpResult> {
  const otp = await prisma.signatureOtp.findUnique({ where: { id: otpId } });

  if (!otp) {
    return { verified: false, error: "Código no encontrado", attemptsLeft: 0 };
  }

  if (otp.verified) {
    return { verified: true };
  }

  if (new Date() > otp.expiresAt) {
    return { verified: false, error: "El código ha expirado. Solicita uno nuevo.", attemptsLeft: 0 };
  }

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    return { verified: false, error: "Máximo de intentos alcanzado. Solicita un nuevo código.", attemptsLeft: 0 };
  }

  const codeHash = hashOtpCode(code);
  const isValid = codeHash === otp.codeHash;

  if (isValid) {
    await prisma.signatureOtp.update({
      where: { id: otpId },
      data: { verified: true, verifiedAt: new Date(), attempts: otp.attempts + 1 },
    });
    return { verified: true };
  }

  const newAttempts = otp.attempts + 1;
  await prisma.signatureOtp.update({
    where: { id: otpId },
    data: { attempts: newAttempts },
  });

  const attemptsLeft = OTP_MAX_ATTEMPTS - newAttempts;
  return {
    verified: false,
    error: attemptsLeft > 0
      ? `Código incorrecto. Te quedan ${attemptsLeft} intento(s).`
      : "Máximo de intentos alcanzado. Solicita un nuevo código.",
    attemptsLeft,
  };
}

export async function isOtpVerified(
  otpId: string,
  signatureRequestId: string,
): Promise<boolean> {
  const otp = await prisma.signatureOtp.findUnique({ where: { id: otpId } });
  if (!otp) return false;
  return otp.verified && otp.signatureRequestId === signatureRequestId;
}
