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
  /**
   * Si es false, no lee ni escribe el archivo de sesión (ver INMOVILLA_SESSION_FILE).
   * @default true
   */
  persistSession?: boolean;
  /** Ruta al JSON de sesión; por defecto INMOVILLA_SESSION_FILE o `.inmovilla-session.json` en cwd. */
  sessionFile?: string;
  /** Ignora sesión guardada y fuerza login completo (credenciales + 2FA si aplica). */
  forceFreshLogin?: boolean;
};
