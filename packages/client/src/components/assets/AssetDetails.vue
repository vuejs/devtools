<script setup lang="ts">
import type { AssetInfo, CodeSnippet } from '@vue/devtools-core'
import { useDevToolsState, viteRpc } from '@vue/devtools-core'
import { vTooltip, VueButton, VueIcon } from '@vue/devtools-ui'
import { useTimeAgo } from '@vueuse/core'
import { openInEditor } from '../../composables/open-in-editor'

const props = defineProps<{
  modelValue: AssetInfo
}>()

const emit = defineEmits<{ (...args: any): void }>()
const state = useDevToolsState()
const asset = useVModel(props, 'modelValue', emit, { passive: true })
const vitePluginDetected = computed(() => state.vitePluginDetected.value)
const importers = computedAsync(() => viteRpc.value.getAssetImporters(asset.value.publicPath).then(res => res), [])
const _vueInspectorDetected = computed(() => vueInspectorDetected.value)

const imageMeta = computedAsync(() => {
  if (asset.value.type !== 'image')
    return undefined

  return viteRpc.value.getImageMeta(asset.value.filePath).then(res => res)
})

const newTextContent = ref()
const textContentCounter = ref(0)
const textContent = computedAsync(async () => {
  if (asset.value.type !== 'text')
    return undefined

  textContentCounter.value

  const content = await viteRpc.value.getTextAssetContent(asset.value.filePath).then(res => res)
  newTextContent.value = content
  return content
})

const codeSnippets = computed(() => {
  const items: CodeSnippet[] = []
  if (asset.value.type === 'image') {
    const attrs = imageMeta.value?.width
      ? `\n  width="${imageMeta.value.width}"\n  height="${imageMeta.value.height}" `
      : ' '
    items.push(
      { lang: 'vue-html', code: `<img${attrs}\n  src="${asset.value.publicPath}"\n/>`, name: 'Plain Image' },
    )
    return items
  }

  items.push({
    lang: 'html',
    code: `<a download href="${asset.value.publicPath}">\n  Download ${asset.value.path.split('/').slice(-1)[0]}\n</a>`,
    name: 'Download link',
  })
  return items
})

const { copy } = useCopy()
const timeAgo = useTimeAgo(() => asset.value.mtime)
const fileSize = computed(() => {
  const size = asset.value.size
  if (size < 1024)
    return `${size} B`
  if (size < 1024 * 1024)
    return `${(size / 1024).toFixed(2)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
})

const aspectRatio = computed(() => {
  if (!imageMeta.value?.width || !imageMeta.value?.height)
    return ''
  const gcd = (a: number, b: number): number => {
    if (!b)
      return a
    return gcd(b, a % b)
  }
  const ratio = gcd(imageMeta.value.width, imageMeta.value.height)
  if (ratio > 3)
    return `${imageMeta.value.width / ratio}:${imageMeta.value.height / ratio}`
  return ''
})

const supportsPreview = computed(() => {
  return [
    'image',
    'text',
    'video',
    'audio',
    'font',
  ].includes(asset.value.type)
})
</script>

<template>
  <div flex="~ col gap-4" min-h-full w-full of-hidden p4>
    <template v-if="supportsPreview">
      <div flex="~ gap2" mb--2 items-center op50>
        <div x-divider />
        <div flex-none>
          Preview
        </div>
        <div x-divider />
      </div>

      <div flex="~" items-center justify-center>
        <AssetPreview
          detail
          max-h-80 min-h-20 min-w-20 w-auto rounded border="~ base"
          :asset="asset"
          :text-content="textContent"
        />
      </div>
    </template>

    <div flex="~ gap2" mb--2 items-center op50>
      <div x-divider />
      <div flex-none>
        Details
      </div>
      <div x-divider />
    </div>

    <table max-w-full w-full table-fixed>
      <tbody>
        <tr>
          <td w-30 ws-nowrap pr5 text-right op50>
            Filepath
          </td>
          <td>
            <div flex="~ gap-1" w-full items-center>
              <FilepathItem :filepath="asset.filePath" text-left />
              <VueIcon
                v-if="vitePluginDetected && _vueInspectorDetected"
                v-tooltip="'Open in Editor'"
                title="Open in Editor"
                icon="i-carbon-launch"
                action flex-none
                :border="false"
                @click="openInEditor(asset.filePath)"
              />
            </div>
          </td>
        </tr>
        <tr>
          <td w-30 ws-nowrap pr5 text-right op50>
            Public Path
          </td>
          <td>
            <div flex="~ gap-1" w-full items-center of-hidden>
              <div flex-auto of-hidden truncate ws-pre font-mono>
                {{ asset.publicPath }}
              </div>
              <VueIcon
                v-tooltip="'Copy public path'"

                title="Copy public path"
                icon="i-carbon-copy"
                action mr1 mt--2px flex-none
                :border="false"
                @click="copy(asset.publicPath, { type: 'assets-public-path' })"
              />
              <RouterLink
                :to="asset.publicPath"
                target="_blank"
              >
                <VueIcon
                  v-tooltip="'Open in Browser'"

                  icon="i-carbon-launch"
                  action flex-none
                  :border="false"
                  title="Open in Browser"
                />
              </RouterLink>
            </div>
          </td>
        </tr>
        <tr>
          <td w-30 ws-nowrap pr5 text-right op50>
            Type
          </td>
          <td capitalize>
            {{ asset.type }}
          </td>
        </tr>
        <template v-if="imageMeta?.width">
          <tr>
            <td w-30 ws-nowrap pr5 text-right op50>
              Image Size
            </td>
            <td>{{ imageMeta.width }} x {{ imageMeta.height }}</td>
          </tr>
          <tr v-if="aspectRatio">
            <td w-30 ws-nowrap pr5 text-right op50>
              Aspect Ratio
            </td>
            <td>{{ aspectRatio }}</td>
          </tr>
        </template>
        <tr>
          <td w-30 ws-nowrap pr5 text-right op50>
            File size
          </td>
          <td>{{ fileSize }}</td>
        </tr>
        <tr>
          <td w-30 ws-nowrap pr5 text-right op50>
            Last modified
          </td>
          <td>{{ new Date(asset.mtime).toLocaleString() }} <span op70>({{ timeAgo }})</span></td>
        </tr>
        <tr>
          <td w-30 ws-nowrap pr5 text-right align-top op50>
            Importers
          </td>
          <td>
            <template v-if="importers.length > 0">
              <div v-for="importer in importers" :key="importer.url" flex="~ gap-1" w-full items-center>
                <FilepathItem :filepath="importer.id || importer.url" text-left />
                <VueIcon
                  v-if="state.vitePluginDetected.value && _vueInspectorDetected && importer.id"
                  v-tooltip="'Open in Editor'"
                  title="Open in Editor"
                  icon="i-carbon-launch"
                  action flex-none
                  :border="false"
                  @click="openInEditor(importer.id!)"
                />
              </div>
            </template>
            <template v-else>
              None
            </template>
          </td>
        </tr>
      </tbody>
    </table>

    <div flex="~ gap2" mb--2 items-center op50>
      <div x-divider />
      <div flex-none>
        Actions
      </div>
      <div x-divider />
    </div>
    <div flex="~ gap2 wrap">
      <VueButton :to="asset.publicPath" download target="_blank">
        Download
        <template #icon>
          <slot name="i-carbon-download" />
        </template>
      </VueButton>
    </div>

    <div flex-auto />

    <CodeSnippets
      v-if="codeSnippets.length"
      border="t base"
      mx--4 mb--4
      :code-snippets="codeSnippets"
    />
  </div>
</template>
