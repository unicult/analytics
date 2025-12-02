import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  base: '/vendingpreneurs/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        login: resolve(__dirname, 'login.html'),
        analytics: resolve(__dirname, 'analytics.html'),
        bookings: resolve(__dirname, 'bookings.html'),
        converted: resolve(__dirname, 'converted.html'),
        courses: resolve(__dirname, 'courses.html'),
        learners: resolve(__dirname, 'learners.html'),
        revenue: resolve(__dirname, 'revenue.html'),
        settings: resolve(__dirname, 'settings.html'),
        warmLeads: resolve(__dirname, 'warm-leads.html'),
      },
    },
  },
})

