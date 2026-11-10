import { createApp } from 'vue'

if (location.pathname.replace(/\/$/, '') === '/cups') {
  const { default: CupsLab } = await import('./cups/CupsLab.vue')
  createApp(CupsLab).mount('#app')
} else {
  const [{ default: App }] = await Promise.all([
    import('./App.vue'),
    import('./styles.css')
  ])
  createApp(App).mount('#app')
}
