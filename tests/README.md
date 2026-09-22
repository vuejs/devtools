# Test baseline

The test suite is split by failure boundary so most regressions do not require a browser:

- `pnpm test:unit` covers codec, runtime scheduling, fixtures, and Chrome port routing in Node.
- `pnpm test:integration` covers runtime RPC and client component behavior in happy-dom.
- `pnpm test:smoke:vite` builds the client and Vite packages, then runs the browser matrix for Vite 8.3+, Options API disabled, custom root/base, bundled dev, custom Vite DevTools options, and SSR middleware mode.
- `pnpm test:smoke:chrome` builds and loads the unpacked MV3 extension in a temporary Chromium profile, then verifies Vue detection across a cross-origin iframe fixture, reload, navigation, and tab teardown.
- `pnpm test:performance` enforces the P0.2 CPU, heap, event-buffer, and message-size budgets with 10k components, 1k events/s, and large-state fixtures.
- `pnpm test:coverage` produces V8 text, JSON summary, and HTML coverage reports.

Install Chromium once before running the smoke test locally:

```sh
pnpm exec playwright install chromium
```

CI runs the Vite matrix on Linux and native Windows. WSL editor-path integration remains a separate platform check because a Linux runner is not equivalent to Windows-hosted WSL.

Issue regressions belong under the closest unit or integration boundary. Name the file `issue-<number>-<slug>.test.ts` and keep the upstream issue URL in the test description or a nearby comment.
