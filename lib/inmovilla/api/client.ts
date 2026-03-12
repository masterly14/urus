import type { InmovillaSession } from "../auth/types";
import { generateMiid } from "../auth/session";

const BASE_URL = "https://crm.inmovilla.com";

type PostBody = Record<string, string>;
type ResponseMode = "json" | "text";

export type InmovillaClient = {
  post: <T = unknown>(path: string, body?: PostBody) => Promise<T>;
  postText: (path: string, body?: PostBody) => Promise<string>;
};

export function createInmovillaClient(
  session: InmovillaSession,
): InmovillaClient {
  const cookieHeader = session.cookies
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  async function request<T = unknown>(
    path: string,
    extraBody: PostBody = {},
    responseMode: ResponseMode = "json",
  ): Promise<T> {
    const miid = generateMiid(session.numAgencia, session.idUsuario);

    const params = new URLSearchParams({
      soyajax: "1",
      l: session.l,
      miid,
      id_pestanya: session.idPestanya,
      ...extraBody,
    });

    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Cookie: cookieHeader,
      },
      body: params.toString(),
    });

    if (!res.ok) {
      throw new Error(
        `Inmovilla POST ${path} falló: ${res.status} ${res.statusText}`,
      );
    }

    if (responseMode === "text") {
      return res.text() as Promise<T>;
    }

    return res.json() as Promise<T>;
  }

  async function post<T = unknown>(
    path: string,
    extraBody: PostBody = {},
  ): Promise<T> {
    return request<T>(path, extraBody, "json");
  }

  async function postText(path: string, extraBody: PostBody = {}): Promise<string> {
    return request<string>(path, extraBody, "text");
  }

  return { post, postText };
}
