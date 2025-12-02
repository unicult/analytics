import { createClient } from '@supabase/supabase-js'

// Initialize Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// Load sidebar data (booking count, converted count, etc.)
async function loadSidebarData() {
  // Fetch booking count and converted count in parallel
  const [bookingsResult, convertedResult] = await Promise.all([
    supabase
      .from('analytics_events')
      .select('*', { count: 'exact', head: true })
      .eq('event_name', 'call_booked'),
    supabase
      .from('backend_revenue_metrics')
      .select('converted_customers_count')
      .single()
  ])

  // Update bookings badge
  if (!bookingsResult.error && bookingsResult.count !== null) {
    const bookingsBadge = document.getElementById('bookings-badge')
    if (bookingsBadge) {
      bookingsBadge.textContent = bookingsResult.count
    }
  }

  // Update converted badge (check both possible IDs)
  if (!convertedResult.error && convertedResult.data) {
    const count = convertedResult.data.converted_customers_count || 0
    
    // Standard sidebar badge
    const convertedBadge = document.getElementById('converted-badge')
    if (convertedBadge) {
      convertedBadge.textContent = count
    }
    
    // Converted page has a different badge ID
    const convertedCountBadge = document.getElementById('converted-count-badge')
    if (convertedCountBadge) {
      convertedCountBadge.textContent = count
    }
  }
}

// Run on load
loadSidebarData()

