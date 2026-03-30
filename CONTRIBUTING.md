# Guía de contribución — Urus Capital

Esta guía describe la disciplina Git del proyecto: ramas, commits, pull requests y releases. Es de cumplimiento obligatorio para todo el equipo.

---

## Estructura de ramas

```
main     ← producción, siempre deployable
  └─ develop  ← integración; se mergea a main cada sábado post-demo
       ├─ feat/M0-event-store
       ├─ feat/M1-ingestion-worker
       ├─ fix/M2-egestion-timeout
       └─ docs/week-01-retro
```

- **`main`**: rama de producción. Solo recibe merges desde `develop` (cada sábado tras la demo).
- **`develop`**: rama de integración. Todas las features y fixes se integran aquí mediante pull requests.
- **Ramas de trabajo**: se crean desde `develop` y siguen la convención de nombres indicada más abajo.

---

## Convención de nombres de rama

Formato:

```
<tipo>/<módulo>-<descripción-kebab-case>
```

**Tipos permitidos:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

**Ejemplos:**

| Rama | Uso |
|------|-----|
| `feat/M0-event-store` | Nueva funcionalidad en módulo M0 |
| `feat/M1-ingestion-worker` | Ingestion Worker (M1) |
| `fix/M2-polling-timeout` | Corrección en M2 |
| `refactor/M3-scoring-weights` | Refactor sin cambio de comportamiento |
| `docs/week-01-retro` | Documentación |
| `test/M3-scoring-unit` | Tests |
| `chore/deps-playwright` | Dependencias, tooling, etc. |

El **módulo** puede ser el ID del plan (M0–M14) o un identificador corto (`deps`, `ci`, `week-01`).

---

## Commits — Conventional Commits (obligatorio)

### Formato

```
<tipo>(<alcance>): <descripción imperativa en español>

[cuerpo opcional — qué y por qué, no cómo]

[footer opcional — refs a issues, breaking changes]
```

### Reglas

- **Un commit = un cambio lógico.** Prohibido "arreglos varios", "WIP" o mezclar varias features en un solo commit.
- **Nunca** commitear secretos, `.env`, credenciales ni tokens.
- El **alcance** usa el ID del módulo cuando aplique (M0–M14) o `deps`, `ci`, etc.
- La **descripción** en imperativo y en español: "implementar", "corregir", "añadir", no "implementado" ni "fix".

### Ejemplos

```
feat(M1): implementar polling básico de propiedades en Inmovilla
fix(M2): corregir extracción de token CSRF en login silente
refactor(M0): migrar event store a schema dedicado en Neon
test(M3): añadir tests unitarios para scoring de compradores
chore(deps): actualizar playwright a v1.42
docs(M0): documentar API de events en README
```

### Tipos de commit

| Tipo | Uso |
|------|-----|
| `feat` | Nueva funcionalidad |
| `fix` | Corrección de bug |
| `refactor` | Cambio de código sin alterar comportamiento observable |
| `docs` | Solo documentación |
| `test` | Añadir o modificar tests |
| `chore` | Mantenimiento, deps, config, CI |

---

## Pull Requests

- **Base branch:** siempre `develop`. No abrir PRs directos a `main`.
- **Título:** misma convención que los commits (tipo + alcance + descripción imperativa en español).
- **Descripción:** incluir qué cambia, por qué y cómo probarlo.

### Checklist obligatorio (marcar antes de pedir review)

- [ ] Build pasa sin errores (`npm run build`)
- [ ] Tests relevantes añadidos o actualizados (`npm test`)
- [ ] Sin secretos ni credenciales hardcodeadas
- [ ] Tipos TypeScript correctos (sin `any` injustificado)
- [ ] Variables de entorno nuevas documentadas en `.env.example`

La plantilla de PR en `.github/PULL_REQUEST_TEMPLATE.md` incluye este checklist.

---

## Tags y releases

- **Formato:** `v0.<sprint>.<semana-dentro-del-sprint>-week-<número>`
- **Cuándo:** cada sábado, después de la demo semanal.
- **Ejemplo:**

  ```bash
  git tag -a v0.1.0-week-01 -m "Sprint 1.1: Infraestructura base + Ingestion Worker v1"
  ```

Los tags se crean sobre `main` tras el merge de `develop` correspondiente a la demo.

---

## Resumen rápido

| Acción | Regla |
|--------|--------|
| Rama nueva | Desde `develop`, nombre `<tipo>/<módulo>-<descripción-kebab-case>` |
| Commit | Conventional Commits en español, atómico, sin secretos |
| PR | Base `develop`, título como commit, checklist completado |
| Release | Tag `v0.X.Y-week-N` cada sábado post-demo sobre `main` |

Para más detalle sobre el plan de desarrollo y módulos (M0–M14), ver `docs/plan.md`.
