export interface TeamMember {
  id: number
  name: string
  role: string
  focus: string
  load: number
}

export interface ActivityItem {
  id: number
  title: string
  source: string
  minutesAgo: number
  level: 'info' | 'success' | 'warning'
}

export interface TaskItem {
  id: number
  title: string
  owner: string
  done: boolean
  cost: number
}

export interface TaskGroup {
  id: number
  label: string
  tasks: TaskItem[]
}

export interface Project {
  id: number
  slug: string
  name: string
  owner: string
  status: 'healthy' | 'watch' | 'blocked'
  score: number
  summary: string
  groups: TaskGroup[]
}

const owners = ['Ada', 'Evan', 'Mira', 'Nolan', 'Rae', 'Theo']
const tracks = ['Runtime', 'Router', 'Timeline', 'Inspector', 'Pinia', 'Assets']

export const teamMembers: TeamMember[] = owners.map((name, index) => ({
  id: index + 1,
  name,
  role: ['Lead', 'Runtime', 'UX', 'QA', 'Infra', 'DX'][index],
  focus: tracks[index],
  load: 48 + index * 7,
}))

export const activities: ActivityItem[] = [
  {
    id: 1,
    title: 'Mounted route detail branch',
    source: 'router',
    minutesAgo: 3,
    level: 'success',
  },
  {
    id: 2,
    title: 'Updated Pinia state payload',
    source: 'pinia',
    minutesAgo: 8,
    level: 'info',
  },
  {
    id: 3,
    title: 'Rendered dense component grid',
    source: 'performance',
    minutesAgo: 14,
    level: 'warning',
  },
  {
    id: 4,
    title: 'Synced component tree snapshot',
    source: 'components',
    minutesAgo: 21,
    level: 'success',
  },
]

export const projects: Project[] = Array.from({ length: 8 }, (_, projectIndex) => {
  const track = tracks[projectIndex % tracks.length]
  const status = (['healthy', 'watch', 'blocked'] as const)[projectIndex % 3]
  return {
    id: projectIndex + 1,
    slug: `route-lab-${projectIndex + 1}`,
    name: `${track} Workbench ${projectIndex + 1}`,
    owner: owners[projectIndex % owners.length],
    status,
    score: 62 + ((projectIndex * 9) % 34),
    summary: `Nested route and component tree coverage for the ${track.toLowerCase()} surface.`,
    groups: Array.from({ length: 3 }, (_, groupIndex) => ({
      id: projectIndex * 10 + groupIndex + 1,
      label: ['Setup', 'Interactions', 'Validation'][groupIndex],
      tasks: Array.from({ length: 5 }, (_, taskIndex) => ({
        id: projectIndex * 100 + groupIndex * 10 + taskIndex + 1,
        title: `${track} task ${groupIndex + 1}.${taskIndex + 1}`,
        owner: owners[(projectIndex + groupIndex + taskIndex) % owners.length],
        done: (projectIndex + groupIndex + taskIndex) % 3 === 0,
        cost: 2 + ((projectIndex + taskIndex) % 6),
      })),
    })),
  }
})
