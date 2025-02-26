<script setup lang="ts">
import type { AssetInfo } from '@vue/devtools-core'
import { onViteRpcConnected, viteRpc } from '@vue/devtools-core'
import { VueCheckbox, VueDrawer, VueIcon, VueSelect } from '@vue/devtools-ui'
import Fuse from 'fuse.js'

const DETAILS_MAX_ITEMS = 50
const search = ref('')
const navbar = ref<HTMLElement>()
// const dropzone = ref(false)
const view = ref('grid')
const assets = ref<AssetInfo[]>([])

const uniqAssetsTypes = computed(() => {
  const results: { label: string, value: string }[] = []
  for (const asset of assets.value || []) {
    const ext = asset.path.split('.').pop()
    if (ext && !results.find(e => e.value === ext))
      results.push({ label: ext, value: ext })
  }
  return results
})
const filteredExtensions = ref<string[]>([])
// first time, selected all
watchOnce(() => uniqAssetsTypes.value, (v) => {
  filteredExtensions.value = v.map(i => i.value)
})
const selected = ref<AssetInfo>()
const fuse = computed(() => new Fuse(assets.value || [], {
  keys: [
    'path',
  ],
}))
const filtered = computed(() => {
  const result = search.value
    ? fuse.value.search(search.value).map(i => i.item)
    : (assets.value || [])
  return result.filter((asset) => {
    const ext = asset.path.split('.').pop()
    return !ext || filteredExtensions.value.includes(ext)
  })
})

const byFolders = computed(() => {
  const result: Record<string, AssetInfo[]> = {}
  for (const asset of filtered.value) {
    const folder = `${asset.relativePath.split('/').slice(0, -1).join('/')}/`
    if (!result[folder])
      result[folder] = []
    result[folder].push(asset)
  }
  return Object.entries(result).sort(([a], [b]) => a.localeCompare(b))
})

const byTree = computed(() => {
  const root = { path: 'public', children: [] }

  const addToTree = (node: any, pathParts: any, file: AssetInfo) => {
    const [currentPart, ...remainingParts] = pathParts

    let child = node.children.find((child: any) => child.path === currentPart)
    if (!child) {
      child = { ...file, path: currentPart, children: [] }
      node.children.push(child)
    }

    if (remainingParts.length > 1)
      addToTree(child, remainingParts, file)
    else if (remainingParts.length === 1)
      child.children.push({ ...file, path: remainingParts[0] })
  }

  filtered.value.forEach((file) => {
    const pathParts = file.relativePath.split('/').filter(part => part !== '')
    addToTree(root, pathParts, file)
  })

  return root.children
})

function fetchAssets() {
  viteRpc.value.getStaticAssets().then((res) => {
    assets.value = res
  })
}

function onAssetsUpdated() {
  fetchAssets()
}

onViteRpcConnected(() => {
  fetchAssets()
  viteRpc.functions.on('assetsUpdated', onAssetsUpdated)
})
function toggleView() {
  view.value = view.value === 'list' ? 'grid' : 'list'
}

onUnmounted(() => {
  viteRpc.functions.off('assetsUpdated', onAssetsUpdated)
})
</script>

<template>
  <div block h-full of-hidden class="drawer-container relative">
    <div h-full w-full of-auto>
      <Navbar ref="navbar" v-model:search="search" pb2 :no-padding="true">
        <template #actions>
          <div flex-none flex="~ gap2 items-center" text-lg>
            <!-- <VueIcon
            v-tooltip.bottom-end="'File Upload'"
            icon="i-carbon:cloud-upload"
            title="File Upload" :border="false" flex="~ gap-0!" action
            @click="dropzone = !dropzone"
          /> -->
            <VueSelect v-model="filteredExtensions" :multiple="true" :options="uniqAssetsTypes">
              <template #button>
                <IconTitle
                  v-tooltip.bottom-end="'Filter'"
                  icon="i-carbon-filter hover:op50" :border="false"
                  title="Filter" relative cursor-pointer p2 text-lg
                  @click="() => { }"
                >
                  <span flex="~ items-center justify-center" absolute bottom-0 right-2px h-4 w-4 rounded-full bg-primary-800 text-8px text-white>
                    {{ filteredExtensions.length }}
                  </span>
                </IconTitle>
              </template>
              <template
                #item="{
                  item, active,
                }"
              >
                <div
                  w-full flex="~ gap-2 items-center" rounded px2 py2
                >
                  <VueCheckbox :model-value="active" />
                  <span text-xs op75>{{ item.label }}</span>
                </div>
              </template>
            </VueSelect>
            <VueIcon
              v-tooltip.bottom-end="'Toggle View'"
              :border="false"
              :icon="view === 'grid' ? 'i-carbon-list' : 'i-carbon-grid'"
              title="Toggle view"
              action cursor-pointer text-lg
              @click="toggleView"
            />
          </div>
        </template>
        <div op50>
          <span v-if="search">{{ filtered.length }} matched · </span>
          <span>{{ assets?.length }} assets in total</span>
        </div>
      </Navbar>

      <template v-if="view === 'grid'">
        <template v-if="byFolders.length > 1">
          <SectionBlock
            v-for="[folder, items] of byFolders"
            :key="folder"
            :text="folder"
            :description="`${items.length} items`"
            :open="items.length <= DETAILS_MAX_ITEMS"
            :padding="false"
          >
            <div mt--4 px2 grid="~ cols-minmax-8rem">
              <AssetGridItem v-for="a of items" :key="a.path" :asset="a" :folder="folder" @click="selected = a" />
            </div>
          </SectionBlock>
        </template>
        <div v-else p2 grid="~ cols-minmax-8rem">
          <AssetGridItem v-for="a of filtered" :key="a.path" :asset="a" @click="selected = a" />
        </div>
      </template>
      <div v-else>
        <AssetListItem
          v-for="item, key of byTree" :key="key"
          v-model="selected"
          :item="item"
        />
      </div>
    </div>
    <VueDrawer
      :model-value="!!selected"
      :top="navbar"
      permanent mount-to=".drawer-container" position="absolute"
      content-class="w120 text-sm" @update:model-value="(v) => {
        if (!v) selected = undefined
      }"
    >
      <AssetDetails v-if="selected" v-model="selected" />
    </VueDrawer>
  </div>
</template>
