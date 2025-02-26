import rule from '.'
import { run } from '../../test-utils'

run({
  name: 'no-vue-runtime-import',
  rule,

  valid: [
    'import Vue from "abc"',
    'import type { Vue } from "vue"',
    'import { type bar, type baz } from "vue"',
  ],

  invalid: [
    {
      code: 'import Vue from "vue"',
      errors: [{ messageId: 'no-vue-runtime-import' }],
    },
    {
      code: 'import { abc } from "vue"',
      errors: [{ messageId: 'no-vue-runtime-import' }],
    },
    {
      code: 'import * as Vue from "vue"',
      errors: [{ messageId: 'no-vue-runtime-import' }],
    },
    {
      code: 'import { foo, type bar } from "vue"',
      errors: [{ messageId: 'no-vue-runtime-import' }],
    },
  ],
})
