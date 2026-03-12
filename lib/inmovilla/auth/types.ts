export type InmovillaSession = {
  l: string;
  idPestanya: string;
  miid: string;
  idUsuario: string;
  numAgencia: string;
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Strict" | "Lax" | "None";
  }>;
};

export type InmovillaLoginOptions = {
  headless?: boolean;
  /** Milliseconds to wait before fetching the 2FA email (default: 10000) */
  twoFADelayMs?: number;
  /** Overall login timeout in milliseconds (default: 90000) */
  timeoutMs?: number;
};
