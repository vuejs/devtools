import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useAppStore = defineStore('app', () => {
  const count = ref(120)
  const map = ref(new Map([['a', 1], ['b', 2], ['c.test', 3]]))
  const set = ref(new Set([1, 2, 3]))
  const obj = ref({ 'foo.test': 1 })
  function increment() {
    count.value++
  }
  const doubledCount = computed(() => count.value * 2)

  return { count, doubledCount, increment, map, set, obj }
})

export const useCounterStore = defineStore('counter', () => {
  const count = ref(10)
  const name = ref('webfansplz!!!')
  function increment() {
    count.value++
  }

  return { count, name, increment }
})

// User Management Store - Test deep nested structures
export const useUserStore = defineStore('userManagement', () => {
  const currentUser = ref({
    id: 1,
    username: 'john_doe',
    profile: {
      firstName: 'John',
      lastName: 'Doe',
      preferences: {
        theme: 'dark',
        notifications: {
          email: true,
          push: false,
          marketing: {
            enabled: false,
            frequency: 'weekly',
            categories: ['product', 'news'],
          },
        },
        privacy: {
          profileVisibility: 'public',
          dataSharing: {
            analytics: true,
            marketing: false,
            thirdParty: {
              google: true,
              facebook: false,
            },
          },
        },
      },
    },
    permissions: ['read', 'write', 'admin'],
  })

  const users = ref([
    { id: 1, username: 'john_doe', status: 'active' },
    { id: 2, username: 'jane_smith', status: 'active' },
  ])

  function updateUserProfile(updates: any) {
    if (currentUser.value) {
      currentUser.value.profile = { ...currentUser.value.profile, ...updates }
    }
  }

  return { currentUser, users, updateUserProfile }
})

// Product Management Store - Test mixed array and object structures
export const useProductStore = defineStore('productCatalog', () => {
  const categories = ref([
    {
      id: 1,
      name: 'Electronics',
      subcategories: [
        { id: 11, name: 'Smartphones', products: ['iPhone', 'Samsung'] },
        { id: 12, name: 'Laptops', products: ['MacBook', 'ThinkPad'] },
      ],
    },
  ])

  const inventory = ref({
    warehouse1: {
      location: 'New York',
      items: {
        electronics: { smartphones: 150, laptops: 75 },
        clothing: { mens: 300, womens: 450 },
      },
    },
  })

  return { categories, inventory }
})

// Application Settings Store - Test deep configuration structures
export const useSettingsStore = defineStore('applicationSettings', () => {
  const config = ref({
    app: {
      name: 'Vue DevTools Demo',
      features: {
        authentication: {
          enabled: true,
          session: { timeout: 3600, refreshToken: true },
        },
        notifications: {
          enabled: true,
          types: {
            email: { enabled: true, templates: ['welcome', 'reset'] },
            push: { enabled: false },
            sms: {
              enabled: true,
              provider: 'twilio',
              credentials: { accountSid: 'AC123...', authToken: '[HIDDEN]' },
            },
          },
        },
      },
    },
    ui: {
      theme: {
        mode: 'dark',
        colors: { primary: '#3b82f6', secondary: '#64748b' },
      },
    },
  })

  function updateConfig(path: string, value: any) {
    const keys = path.split('.')
    let current = config.value
    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]]
    }
    current[keys[keys.length - 1]] = value
  }

  return { config, updateConfig }
})
