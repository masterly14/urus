# Plantilla de Prompt — Sesión de Trabajo

Copia el bloque y rellena los campos entre corchetes.

---

## Formato completo

```
DÍA DE TRABAJO: [fecha]
SPRINT / SEMANA: [Sprint X, Semana Y]
ITEM: [referencia al plan o descripción del trabajo]
MÓDULOS: [M0, M4, etc.]

OBSERVACIONES:
[Contexto adicional. Si no hay, escribe "Ninguna".]

Sigue el protocolo de @.cursor/rules/daily-work.mdc
```

## Formato mínimo (si tienes prisa)

```
Hoy trabajamos en [módulo/ítem]. [Observaciones si las hay].
Sigue el protocolo de @.cursor/rules/daily-work.mdc
```

---

## Tips

1. **No necesitas saber el HOW completo**. El agente investiga el código y te propone. Tú decides.

2. **Si el ítem es grande**, indica qué bloques o alcance quieres en esta sesión.

3. **Responde TODAS las preguntas** que el agente te haga antes de darle OK. Lo que no respondas, lo asumirá.

4. **Entregable esperado** (según la rule): commits atómicos con Conventional Commits (`init.mdc`), actualización de `README.md` cuando cambien comandos/setup/env, y un archivo en `docs/` (o ampliación de uno existente) que documente lo implementado.
