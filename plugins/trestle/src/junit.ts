import { SaxesParser } from 'saxes'

interface ReportElement {
  kind: 'suite' | 'case' | 'other'
  testId?: string
}

export function junitDocument(stdout: string): string {
  const start = stdout.search(/<\?xml|<(?:[\w.-]+:)?testsuites?[\s>]/)
  return start > 0 ? stdout.slice(start) : stdout
}

export function junitFailureIds(xml: string): string[] {
  const parser = new SaxesParser({ xmlns: true, fileName: 'JUnit report' })
  const elements: ReportElement[] = []
  const failures = new Set<string>()
  let namespace: string

  parser.on('opentag', tag => {
    const parent = elements.at(-1)
    const suite = tag.local === 'testsuite' || tag.local === 'testsuites'
    if (!parent) {
      if (!suite) throw new Error('Expected a JUnit testsuite or testsuites root element')
      namespace = tag.uri
    }

    let element: ReportElement = { kind: 'other' }
    if (tag.uri === namespace) {
      if (suite && (!parent || parent.kind === 'suite')) {
        element = { kind: 'suite' }
      } else if (tag.local === 'testcase' && parent?.kind === 'suite') {
        const name = tag.attributes.name?.value
        const cls = tag.attributes.classname?.value
        element = { kind: 'case', testId: cls && name ? cls + '::' + name : name }
      } else if (parent?.kind === 'case' && (tag.local === 'failure' || tag.local === 'error')) {
        if (!parent.testId) throw new Error('JUnit failure belongs to a testcase without a name')
        failures.add(parent.testId)
      }
    }
    elements.push(element)
  })
  parser.on('closetag', () => { elements.pop() })
  parser.write(xml).close()
  return [...failures].sort()
}
