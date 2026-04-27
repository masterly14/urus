import {
  forbidden,
  getSessionFromRequest,
  isCeoOrAdmin,
  unauthorized,
  type AppSession,
} from "@/lib/auth/session";

type TemplateAuthResult =
  | { session: AppSession; response: null }
  | { session: null; response: Response };

export async function requireTemplateReadAccess(
  request: Request,
): Promise<TemplateAuthResult> {
  const session = await getSessionFromRequest(request);
  if (!session) return { session: null, response: unauthorized() };
  return { session, response: null };
}

export async function requireTemplateWriteAccess(
  request: Request,
): Promise<TemplateAuthResult> {
  const session = await getSessionFromRequest(request);
  if (!session) return { session: null, response: unauthorized() };
  if (!isCeoOrAdmin(session.role)) return { session: null, response: forbidden() };
  return { session, response: null };
}
