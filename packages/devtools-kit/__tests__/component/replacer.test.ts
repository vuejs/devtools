import { stringifyReplacer } from '../../src/core/component/state/replacer'

// `stringifyReplacer` reads the value from `this[key]`, mirroring how it is
// called during `JSON.stringify`.
function replace(value: unknown) {
  return stringifyReplacer.call({ value }, 'value') as { _custom?: { type?: string, displayText?: string } }
}

describe('stringifyReplacer: component definition detection', () => {
  // #1100: Pinia store state can hold plain class instances that happen to
  // expose a `render` method. Those must not be reported as Vue components.
  it('does not treat a plain class instance with a render method as a component', () => {
    class Chart {
      data = [1, 2, 3]
      render() {
        return 'draw the chart'
      }
    }

    const result = replace(new Chart())

    expect(result?._custom?.type).not.toBe('component-definition')
  })

  it('still detects a real Vue component definition', () => {
    const Button = defineComponent({
      name: 'MyButton',
      render() {
        return h('button', 'Click me')
      },
    })

    const result = replace(Button)

    expect(result?._custom?.type).toBe('component-definition')
    expect(result?._custom?.displayText).toBe('MyButton')
  })

  // #1100: Pinia store state is always wrapped in `reactive()`. A reactive
  // object with an own `render` method must not be reported as a component.
  it('does not treat a reactive object with a render method as a component', () => {
    const store = reactive({
      data: [1, 2, 3],
      render() {
        return 'draw the chart'
      },
    })

    const result = replace(store)

    expect(result?._custom?.type).not.toBe('component-definition')
  })
})
