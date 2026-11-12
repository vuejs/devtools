import { expect, it } from 'vitest'
import { isEnabled, state } from '../src/overlay'

it('can be imported and toggled without a DOM', () => {
  expect(typeof document).toBe('undefined')
  state.isEnabled = true
  expect(isEnabled.value).toBe(true)
  state.isEnabled = false
})
