# Autenticación y Autorización

Sistema de auth real basado en **Better Auth** con Prisma adapter, email/password, invitaciones por email (Resend) y RBAC con 3 roles.

## Stack

- **Better Auth** — servidor y cliente de autenticación
- **Resend** — envío de emails transaccionales (invitaciones)
- **Prisma** — persistencia de usuarios, sesiones, cuentas y verificaciones
- **proxy.ts** (Next.js 16) — protección de rutas a nivel red

## Roles

| Rol | Permisos | Descripción |
|-----|----------|-------------|
| `ceo` | Todo | Dueño de la plataforma |
| `admin` | Todo (igual que CEO) | Administrador/Gestor/Jefe de zona |
| `comercial` | Operativa + su perfil | Agente comercial vinculado a un registro `Comercial` |

CEO y Admin son **equivalentes** en permisos. La distinción es nominal.

## Flujo de invitación

1. CEO/Admin accede a `/platform/configuracion` (pestaña "Usuarios")
2. Introduce email + rol del invitado
3. `POST /api/invitations` crea un registro `Invitation` con token único (expira en 7 días)
4. Resend envía email con enlace a `/register?token=xxx`
5. El invitado abre el enlace, ve su email pre-rellenado, introduce nombre y contraseña
6. `POST /api/invitations/accept` crea el User via Better Auth y marca la invitación como usada
7. El invitado puede hacer login con email + contraseña

## Flujo de login

1. Usuario accede a `/login`
2. Introduce email + contraseña
3. Better Auth valida credenciales y crea sesión (cookie)
4. Redirige a `/platform` (o `callbackUrl` si venía de una ruta protegida)

## Protección de rutas

### proxy.ts (nivel red)

Verifica la existencia de la cookie de sesión. Si no hay cookie, redirige a `/login`.

**Rutas públicas (whitelist):**
- `/`, `/login`, `/register`
- `/seleccion/*`, `/validar-seleccion/*`, `/firma/*`, `/referidos/*`, `/postventa/*`, `/platform/postventa/*`
- `/api/auth/*`, `/api/whatsapp/webhook`, `/api/cron/*`, `/api/events`, `/api/leads/*`, `/api/workers/*`
- `/api/firma/*`, `/api/seleccion/*`, `/api/validar-seleccion/*`, `/api/postventa/*`, `/api/referidos`, `/api/comerciales/activos`

### Guards de API (nivel handler)

Cada API route que requiere auth usa `getSessionFromRequest(request)`:

```typescript
import { getSessionFromRequest, isCeoOrAdmin, unauthorized, forbidden } from "@/lib/auth/session";

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();          // 401
  if (!isCeoOrAdmin(session.role)) return forbidden(); // 403
  // ...
}
```

### Guards de UI (nivel componente)

Los layouts usan `useSession()` de `@/lib/hooks/use-session`:
- `/platform/bi/*` — `isCeoOrAdmin` guard con redirect
- `/platform/rendimiento/*` — tabs filtrados por `ceoOnly`
- Sidebar — items `ceoOnly` ocultos para comerciales

## Archivos principales

| Archivo | Propósito |
|---------|-----------|
| `lib/auth/index.ts` | Config Better Auth server (Prisma, plugins) |
| `lib/auth/client.ts` | Better Auth client (React hooks) |
| `lib/auth/session.ts` | Helpers server-side: `getSession`, `getSessionFromRequest`, guards |
| `lib/auth/permissions.ts` | RBAC: definición de roles y permisos |
| `lib/hooks/use-session.tsx` | Hook React para obtener sesión del usuario actual |
| `proxy.ts` | Protección de rutas Next.js 16 |
| `app/api/auth/[...all]/route.ts` | Catch-all de Better Auth |
| `app/api/invitations/route.ts` | CRUD de invitaciones (CEO/Admin) |
| `app/api/invitations/validate/route.ts` | Validar token de invitación |
| `app/api/invitations/accept/route.ts` | Aceptar invitación y crear usuario |
| `app/api/users/route.ts` | Listar usuarios (CEO/Admin) |
| `app/api/users/link-comercial/route.ts` | Vincular User a Comercial |
| `lib/email/resend.ts` | Cliente Resend + plantilla de invitación |
| `components/configuracion/user-management.tsx` | UI de gestión de usuarios |

## Modelos Prisma

- `User` — usuario con `role`, `email`, `name`, relación opcional a `Comercial`
- `Session` — sesiones activas (gestionadas por Better Auth)
- `Account` — métodos de autenticación (email/password)
- `Verification` — tokens de verificación
- `Invitation` — invitaciones pendientes

## Rate Limiting

Rate limiter in-memory por IP (`lib/api/rate-limit.ts`). Se resetea al reiniciar el proceso.

| Store | Ventana | Max requests | Rutas |
|-------|---------|-------------|-------|
| `auth` | 60s | 10 | `/api/auth/*` (POST — login/signup) |
| `stt` | 60s | 15 | `/api/stt/transcribe` |
| default | 60s | 60 | Disponible para cualquier ruta |

Respuesta 429 con header `Retry-After`.

## Validación de input (Zod)

Todas las rutas POST/PATCH/PUT críticas validan body con Zod `safeParse`. Si el body es inválido, responden 400:

```json
{ "ok": false, "error": "Input inválido", "details": { "campo": ["mensaje"] } }
```

## Rutas protegidas (resumen)

| Grupo | Auth | Role check | Rutas |
|-------|------|------------|-------|
| CEO API | Session | CEO + Admin | `/api/ceo/*`, `/api/dashboard/alerts/*`, `/api/eval/*`, `/api/whatsapp/send` |
| Dashboard | Session | CEO + Admin | `/api/dashboard/comerciales`, `/api/dashboard/comercial/[id]`, `/api/configuracion/*` |
| Operativa | Session | Cualquier rol | `/api/colaboradores/*`, `/api/pricing/*`, `/api/contracts/*`, `/api/stt/*`, `/api/dashboard/mental-health` |
| Cron/Workers | CRON_SECRET | N/A | `/api/cron/*`, `/api/events`, `/api/workers/*`, `/api/leads/*` |
| Pública | Ninguna | N/A | `/api/auth/*`, `/api/firma/*`, `/api/seleccion/*`, `/api/referidos` (POST), `/api/whatsapp/webhook` |

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `BETTER_AUTH_SECRET` | Secret para firmar tokens/cookies |
| `BETTER_AUTH_URL` | URL base de la app |
| `RESEND_API_KEY` | API key de Resend |
| `RESEND_FROM` | Email remitente para invitaciones |
| `CEO_SEED_EMAIL` | Email del CEO inicial (seed) |
| `CEO_SEED_PASSWORD` | Contraseña del CEO inicial (seed) |

## Cómo probarlo

1. Configurar variables en `.env`:
   ```
   BETTER_AUTH_SECRET=<generar con openssl rand -base64 32>
   BETTER_AUTH_URL=http://localhost:3000
   CEO_SEED_EMAIL=ceo@urus.capital
   CEO_SEED_PASSWORD=<contraseña segura>
   ```

2. Crear un usuario CEO seed (una sola vez):
   ```bash
   npm run seed:ceo
   ```

3. Iniciar dev server:
   ```bash
   npm run dev
   ```

4. Acceder a `http://localhost:3000/login` e ingresar credenciales del CEO

5. Ir a `/platform/configuracion` > pestaña "Usuarios" > invitar un comercial

6. Verificar:
   - El comercial no puede acceder a `/platform/bi/*`
   - El comercial solo ve su perfil en rendimiento
   - Las API routes de CEO devuelven 403 para comerciales
   - Las API routes de colaboradores devuelven 401 sin sesión

## Tests de seguridad

```bash
npm test -- lib/auth/__tests__/ lib/api/__tests__/
```

Verifica: 401 sin sesión, 403 para roles no autorizados, rate limiter bloquea tras exceder límite, admin tiene acceso equivalente a CEO.
