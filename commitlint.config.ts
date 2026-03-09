export default {
    extends: ['@commitlint/config-conventional'],
    rules: {
      'type-enum': [2, 'always', ['feat', 'fix', 'refactor', 'docs', 'test', 'chore']],
      'scope-empty': [2, 'never'],           // obliga a poner (alcance)
      'subject-case': [2, 'never', ['upper-case']], // no MAYÚSCULAS
      'header-max-length': [2, 'always', 100],
    }
  }