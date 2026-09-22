import { fileURLToPath } from 'node:url'

export const clientDist = fileURLToPath(new URL('../client', import.meta.url))
