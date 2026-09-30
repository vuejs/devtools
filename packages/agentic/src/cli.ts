#!/usr/bin/env node
import process from 'node:process'
import { cac } from 'cac'

async function main() {
  const cli = cac('vue-devtools-agentic')
  cli
    .command('connect', 'Discover running Devframe projects and expose their tools over stdio MCP')
    .option('--port <port>', 'Probe an additional port (repeatable)')
    .option('--base <path>', 'Base path for explicit port probes', { default: '/' })
    .option('--instances-dir <dir>', 'Override the Devframe instance registry directory')
    .option('--timeout <ms>', 'Probe timeout per instance in milliseconds', { default: 1000 })
    .action(async (options) => {
      const ports: number[] = (
        Array.isArray(options.port)
          ? options.port
          : options.port === undefined
            ? []
            : [options.port]
      ).map(Number)
      if (ports.some((port) => !Number.isInteger(port) || port < 1 || port > 65535)) {
        throw new Error('--port must be an integer between 1 and 65535')
      }
      const timeoutMs = Number(options.timeout)
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new Error('--timeout must be a positive number of milliseconds')
      }
      const { startConnectServer } = await import('@devframes/agentic/connect')
      await startConnectServer({
        ports,
        base: options.base,
        instancesDir: options.instancesDir,
        timeoutMs,
        authToken: process.env.DEVFRAME_MCP_AUTH_TOKEN,
      })
      process.stdin.resume()
    })
  cli.help()
  cli.parse(process.argv, { run: false })
  if (!cli.matchedCommand) {
    if (!cli.options.help) cli.outputHelp()
    return
  }
  await cli.runMatchedCommand()
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
