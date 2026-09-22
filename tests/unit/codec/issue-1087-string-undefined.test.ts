import { describe, expect, it } from 'vitest'
import { encodeValue } from '../../../packages/kit/src/codec/encode'

describe('issue #1087: string and undefined encoding (https://github.com/vuejs/devtools/issues/1087)', () => {
  it('keeps the string "undefined" distinct from the undefined primitive', () => {
    expect(encodeValue('undefined')).toEqual({ kind: 'string', value: 'undefined' })
    expect(encodeValue(undefined)).toEqual({ kind: 'undefined' })
  })
})
