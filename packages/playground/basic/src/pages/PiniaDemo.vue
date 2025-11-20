<script setup lang="ts">
import {
  useAppStore,
  useCounterStore,
  useProductStore,
  useSettingsStore,
  useUserStore,
} from '../stores'

// Use all stores
const appStore = useAppStore()
const counterStore = useCounterStore()
const userStore = useUserStore()
const productStore = useProductStore()
const settingsStore = useSettingsStore()

function updateProfile() {
  userStore.updateUserProfile({
    preferences: {
      ...userStore.currentUser.profile.preferences,
      theme: userStore.currentUser.profile.preferences.theme === 'dark' ? 'light' : 'dark',
    },
  })
}

function toggleTheme() {
  const currentTheme = settingsStore.config.ui.theme.mode
  settingsStore.updateConfig('ui.theme.mode', currentTheme === 'dark' ? 'light' : 'dark')
}
</script>

<template>
  <div class="pinia-demo-container">
    <h1 class="mb-6 text-2xl font-bold">
      Pinia Store Demo - Test Expand/Collapse Functionality
    </h1>

    <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
      <!-- User Management Store Demo -->
      <div class="store-section">
        <h2 class="mb-4 text-xl font-semibold">
          User Management Store (userManagement)
        </h2>
        <div class="rounded-lg bg-gray-800 p-4">
          <p><strong>Current User:</strong> {{ userStore.currentUser.username }}</p>
          <p><strong>Total Users:</strong> {{ userStore.users.length }}</p>
          <button class="mt-2 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700" @click="updateProfile">
            Update Profile
          </button>
        </div>
      </div>

      <!-- Product Management Store Demo -->
      <div class="store-section">
        <h2 class="mb-4 text-xl font-semibold">
          Product Management Store (productCatalog)
        </h2>
        <div class="rounded-lg bg-gray-800 p-4">
          <p><strong>Categories Count:</strong> {{ productStore.categories.length }}</p>
          <p><strong>Warehouse Location:</strong> {{ productStore.inventory.warehouse1.location }}</p>
        </div>
      </div>

      <!-- Application Settings Store Demo -->
      <div class="store-section">
        <h2 class="mb-4 text-xl font-semibold">
          Application Settings Store (applicationSettings)
        </h2>
        <div class="rounded-lg bg-gray-800 p-4">
          <p><strong>App Name:</strong> {{ settingsStore.config.app.name }}</p>
          <p><strong>Theme Mode:</strong> {{ settingsStore.config.ui.theme.mode }}</p>
          <button class="mt-2 rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700" @click="toggleTheme">
            Toggle Theme
          </button>
        </div>
      </div>

      <!-- Original Store Demo -->
      <div class="store-section">
        <h2 class="mb-4 text-xl font-semibold">
          Original Stores (app & counter)
        </h2>
        <div class="rounded-lg bg-gray-800 p-4">
          <p><strong>App Count:</strong> {{ appStore.count }}</p>
          <p><strong>Double Count:</strong> {{ appStore.doubledCount }}</p>
          <p><strong>Counter Count:</strong> {{ counterStore.count }}</p>
          <p><strong>Counter Name:</strong> {{ counterStore.name }}</p>

          <div class="mt-4">
            <button
              class="mr-2 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              @click="appStore.increment"
            >
              App +1
            </button>
            <button
              class="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700"
              @click="counterStore.increment"
            >
              Counter +1
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-8 rounded-lg bg-yellow-900 p-4">
      <h3 class="mb-2 text-lg font-semibold">
        🚀 Test Deep Expansion Features
      </h3>
      <p class="mb-3 text-sm">
        Open Vue DevTools (http://localhost:3000/__devtools__/), enter Pinia panel to test:
      </p>
      <ul class="list-disc list-inside text-sm space-y-1">
        <li><strong>Search Auto-Expand:</strong> Enter keywords to automatically expand all levels</li>
        <li><strong>Expand/Collapse Buttons:</strong> Click buttons in state panel top-right to expand all nested levels</li>
        <li><strong>Hover Actions:</strong> Mouse hover on tree nodes to see quick action buttons</li>
        <li><strong>Deep Nesting:</strong> Supports expansion of complex structures up to 30 levels deep</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.pinia-demo-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
  color: white;
  background: #1a1a1a;
  min-height: 100vh;
}

.store-section {
  background: #2d2d2d;
  padding: 1.5rem;
  border-radius: 0.5rem;
  border: 1px solid #404040;
}

.store-section h2 {
  color: #60a5fa;
  border-bottom: 2px solid #60a5fa;
  padding-bottom: 0.5rem;
}

button:hover {
  transform: translateY(-1px);
  transition: all 0.2s ease;
}
</style>
