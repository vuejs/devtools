# Contribution Guide

> Hi! We're really excited that you're interested in contributing to Vue DevTools! Before submitting your contribution, please read through the following guide.

## Development Setup

You will need [Node.js](https://nodejs.org) **version 18.19+**, and [PNPM](https://pnpm.io) **version 10+**.

We also recommend installing [@antfu/ni](https://github.com/antfu/ni) to help switching between repos using different package managers. `ni` also provides the handy `nr` command which running npm scripts easier.

After cloning the repo, run:

```bash
pnpm i # install the dependencies of the project
```

:::tip ⚠️

Since `electron` is used in the project, if your network environment is unstable, you may be unable to install dependencies.
You can use the following command to set up the mirror, and run `pnpm i` again to install the dependencies.

```bash
pnpm config set ELECTRON_MIRROR https://npmmirror.com/mirrors/electron/
```

:::

## Git Hooks

The project uses [simple-git-hooks](https://github.com/toplenboren/simple-git-hooks) to enforce the following on each commit:

- Automatically format changed files using ESLint

## Development

Build the project with watch mode:

```sh
pnpm dev
```

OR

Build the project with:

```sh
pnpm build
```

And then run the playground:

```sh
pnpm play
```

## Contributing

Please feel free to submit pull requests for bug fixes. **If you have any new ideas or feature requests, please open an issue or discussion first**.
