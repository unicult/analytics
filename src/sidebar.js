import { createClient } from '@supabase/supabase-js'

// Initialize Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// Cache key and duration (5 minutes)
const CACHE_KEY = 'sidebar_data_cache'
const CACHE_DURATION = 5 * 60 * 1000

// Try to get cached data
function getCachedData() {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (cached) {
      const { data, timestamp } = JSON.parse(cached)
      if (Date.now() - timestamp < CACHE_DURATION) {
        return data
      }
    }
  } catch (e) {}
  return null
}

// Cache the data
function setCachedData(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      data,
      timestamp: Date.now()
    }))
  } catch (e) {}
}

// Update badges in the DOM
function updateBadges(data) {
  const { bookingsCount, convertedCount } = data
  
  // Update bookings badge
  const bookingsBadge = document.getElementById('bookings-badge')
  if (bookingsBadge && bookingsCount !== null) {
    bookingsBadge.textContent = bookingsCount
  }
  
  // Update converted badge (check both possible IDs)
  const convertedBadge = document.getElementById('converted-badge')
  if (convertedBadge) {
    convertedBadge.textContent = convertedCount
  }
  
  const convertedCountBadge = document.getElementById('converted-count-badge')
  if (convertedCountBadge) {
    convertedCountBadge.textContent = convertedCount
  }
}

// Load sidebar data (booking count, converted count, etc.)
async function loadSidebarData() {
  // Try cache first for instant display
  const cached = getCachedData()
  if (cached) {
    updateBadges(cached)
  }

  // Fetch from pre-aggregated views (much faster than counting analytics_events)
  const [metricsResult, backendResult] = await Promise.all([
    supabase.from('metrics_dashboard').select('call_booked_users_30d').single(),
    supabase.from('backend_revenue_metrics').select('converted_customers_count').single()
  ])

  const freshData = {
    bookingsCount: metricsResult.data?.call_booked_users_30d || 0,
    convertedCount: backendResult.data?.converted_customers_count || 0
  }
  
  updateBadges(freshData)
  setCachedData(freshData)
}

// Run on load
loadSidebarData()

