import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;

export const resend = resendApiKey ? new Resend(resendApiKey) : null;

export const EMAIL_FROM = process.env.RESEND_FROM ?? "noreply@urus.capital";

export async function sendInvitationEmail(params: {
  to: string;
  inviterName: string;
  role: string;
  registerUrl: string;
}) {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY no configurada, email no enviado:", params.to);
    return;
  }

  const roleLabel = params.role === "admin" ? "Administrador" : "Comercial";

  await resend.emails.send({
    from: EMAIL_FROM,
    to: params.to,
    subject: "Invitación a URUS Capital",
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h1 style="font-size: 24px; color: #1a1a1a; margin-bottom: 8px;">URUS Capital</h1>
        <p style="color: #555; font-size: 15px; line-height: 1.6;">
          <strong>${params.inviterName}</strong> te ha invitado a unirte a URUS Capital como <strong>${roleLabel}</strong>.
        </p>
        <p style="color: #555; font-size: 15px; line-height: 1.6;">
          Haz clic en el enlace para crear tu cuenta:
        </p>
        <a href="${params.registerUrl}"
           style="display: inline-block; background: #1a1a1a; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; margin: 16px 0;">
          Crear mi cuenta
        </a>
        <p style="color: #999; font-size: 12px; margin-top: 24px;">
          Este enlace expira en 7 días. Si no esperabas esta invitación, puedes ignorar este correo.
        </p>
      </div>
    `,
  });
}
