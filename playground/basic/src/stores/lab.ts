import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { activities, projects, teamMembers } from '../data/fixtures'

export const useLabStore = defineStore('lab', () => {
  const renderSize = ref(96)
  const selectedTrack = ref('runtime')
  const pinnedProjectIds = ref<number[]>([1, 3])
  const activityLog = ref([...activities])
  const projectList = ref([...projects])
  const members = ref([...teamMembers])

  const totalTasks = computed(() =>
    projectList.value.reduce(
      (sum, project) =>
        sum + project.groups.reduce((groupSum, group) => groupSum + group.tasks.length, 0),
      0,
    ),
  )
  const completedTasks = computed(() =>
    projectList.value.reduce(
      (sum, project) =>
        sum +
        project.groups.reduce(
          (groupSum, group) => groupSum + group.tasks.filter((task) => task.done).length,
          0,
        ),
      0,
    ),
  )
  const pinnedProjects = computed(() =>
    projectList.value.filter((project) => pinnedProjectIds.value.includes(project.id)),
  )
  const averageScore = computed(() =>
    Math.round(
      projectList.value.reduce((sum, project) => sum + project.score, 0) /
        Math.max(projectList.value.length, 1),
    ),
  )

  function setRenderSize(value: number) {
    renderSize.value = Math.max(24, Math.min(20_000, value))
  }

  function togglePin(projectId: number) {
    pinnedProjectIds.value = pinnedProjectIds.value.includes(projectId)
      ? pinnedProjectIds.value.filter((id) => id !== projectId)
      : [...pinnedProjectIds.value, projectId]
  }

  function completeTask(taskId: number) {
    for (const project of projectList.value) {
      for (const group of project.groups) {
        const task = group.tasks.find((item) => item.id === taskId)
        if (task) task.done = !task.done
      }
    }
  }

  function addActivity(title = 'Manual route check') {
    activityLog.value.unshift({
      id: Date.now(),
      title,
      source: selectedTrack.value,
      minutesAgo: 0,
      level: 'info',
    })
  }

  return {
    activityLog,
    averageScore,
    completedTasks,
    completeTask,
    members,
    pinnedProjectIds,
    pinnedProjects,
    projectList,
    renderSize,
    selectedTrack,
    setRenderSize,
    addActivity,
    togglePin,
    totalTasks,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useLabStore, import.meta.hot))
}
