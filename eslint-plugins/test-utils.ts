import type { RuleTesterInitOptions, TestCasesOptions } from 'eslint-vitest-rule-tester'

import tsParser from '@typescript-eslint/parser'
import { run as _run } from 'eslint-vitest-rule-tester'

export * from 'eslint-vitest-rule-tester'

export { unindent as $ } from 'eslint-vitest-rule-tester'

export interface ExtendedRuleTesterOptions extends RuleTesterInitOptions, TestCasesOptions {
  lang?: 'js' | 'ts'
}

export function run(options: ExtendedRuleTesterOptions) {
  return _run({
    recursive: false,
    verifyAfterFix: false,
    ...(options.lang === 'js' ? {} : { parser: tsParser as any }),
    ...options,
  })
}
