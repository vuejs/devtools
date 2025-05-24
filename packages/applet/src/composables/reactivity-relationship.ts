import type { ReactivityGraphNode, ReactivityRelationship } from '@vue/devtools-kit'
import type { Edge, Node, Options } from 'vis-network'
import { useDevToolsColorMode } from '@vue/devtools-ui'
import { DataSet } from 'vis-network/standalone'
import { computed } from 'vue'

export const reactivityType = {
  ref: {
    color: '#42b883',
  },
  computed: {
    color: '#3B86CB',
  },
  reactive: {
    color: '#ffd700',
  },
  render: {
    color: '#ff4500',
  },
  watch: {
    color: '#2dd4bf',
  },
}

const { isDark } = useDevToolsColorMode()

export const graphOptions = computed<Options>(() => ({
  nodes: {
    shape: 'dot',
    size: 16,
    font: {
      color: isDark.value ? '#fff' : '#000',
      multi: 'html',
    },
  },
  interaction: {
    hover: true,
  },
  physics: {
    maxVelocity: 146,
    solver: 'forceAtlas2Based',
    timestep: 0.35,
    stabilization: {
      enabled: true,
      iterations: 200,
    },
  },
  groups: reactivityType,
}))

export const graphNodes = new DataSet<Node>([])
export const graphEdges = new DataSet<Edge>([])

function normalizeNodeLabel(node: ReactivityGraphNode) {
  if (node.type === 'render') {
    return `${node.data.instanceName} (component)`
  }
  if (node.type === 'watch') {
    return `watch`
  }
  return `${node.data.key} (${node.type})`
}

export function buildReactivityGraph(nodes: ReactivityGraphNode[], relationships: ReactivityRelationship[]) {
  graphNodes.clear()
  graphEdges.clear()
  nodes.forEach((node) => {
    graphNodes.add({
      id: node.id,
      shape: 'dot',
      size: 16,
      label: normalizeNodeLabel(node),
      group: node.type,
    })
  })
  relationships.forEach((relationship) => {
    graphEdges.add({
      arrows: {
        to: {
          enabled: true,
          scaleFactor: 0.8,
        },
      },
      id: relationship.id,
      from: relationship.from,
      to: relationship.to,
    })
  })
}
