import { createClient } from '@supabase/supabase-js'

// Initialize Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// Pagination state
let allBookings = []
let currentPage = 0
const bookingsPerPage = 20
let currentSort = 'date' // Default to most recent

// Main load function
async function loadBookings() {
  console.log('Fetching bookings data...')

  // Fetch ALL call_booked events using pagination
  let allData = []
  let page = 0
  const pageSize = 1000
  let hasMore = true

  while (hasMore) {
    const { data, error } = await supabase
      .from('analytics_events')
      .select('*')
      .eq('event_name', 'call_booked')
      .order('occurred_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (error) {
      console.error('Error fetching bookings:', error)
      break
    }

    if (data && data.length > 0) {
      allData = [...allData, ...data]
      page++
      hasMore = data.length === pageSize
    } else {
      hasMore = false
    }
  }

  const bookings = allData
  console.log(`Fetched ${bookings.length} total bookings`)

  // For each booking, fetch their recent events to build the journey
  const bookingsWithJourney = await Promise.all(
    bookings.map(async (booking) => {
      const { data: events } = await supabase
        .from('analytics_events')
        .select('*')
        .eq('email', booking.email)
        .lt('occurred_at', booking.occurred_at)
        .order('occurred_at', { ascending: false })
        .limit(30) // Fetch more to find matching page_close events for durations

      // Process events to merge page_view with page_close for duration
      const processedEvents = processEventsWithDuration(events || [])

      return {
        ...booking,
        recentEvents: processedEvents
      }
    })
  )

  // Calculate intent scores
  const bookingsWithScores = bookingsWithJourney.map(booking => ({
    ...booking,
    intentScore: calculateIntentScore(booking),
    eventCount: booking.recentEvents?.length || 0
  }))

  // Store globally for pagination
  allBookings = bookingsWithScores
  
  // Apply default sort (most recent first - already sorted from DB query)
  sortBookings()

  // Update KPIs
  updateKPIs(allBookings)

  // Render the first page
  currentPage = 0
  renderCurrentPage()

  // Setup search
  setupSearch()

  // Setup pagination controls
  setupPagination()
  
  // Setup sort dropdown
  setupSort()

  console.log('Bookings page loaded!')
}

// Render current page of bookings
function renderCurrentPage() {
  const start = currentPage * bookingsPerPage
  const end = start + bookingsPerPage
  const pageBookings = allBookings.slice(start, end)
  
  renderBookingsTable(pageBookings)
  updatePaginationInfo()
  setupBookingsJourneyTooltips()
}

// Update pagination info display
function updatePaginationInfo() {
  const infoEl = document.getElementById('pagination-info')
  const totalPages = Math.ceil(allBookings.length / bookingsPerPage)
  
  if (infoEl) {
    const start = currentPage * bookingsPerPage + 1
    const end = Math.min((currentPage + 1) * bookingsPerPage, allBookings.length)
    infoEl.textContent = `${start}-${end} of ${allBookings.length}`
  }

  // Update button states
  const prevBtn = document.getElementById('pagination-prev')
  const nextBtn = document.getElementById('pagination-next')

  if (prevBtn) {
    if (currentPage === 0) {
      prevBtn.classList.add('opacity-50', 'cursor-not-allowed')
    } else {
      prevBtn.classList.remove('opacity-50', 'cursor-not-allowed')
    }
  }

  if (nextBtn) {
    if (currentPage >= totalPages - 1) {
      nextBtn.classList.add('opacity-50', 'cursor-not-allowed')
    } else {
      nextBtn.classList.remove('opacity-50', 'cursor-not-allowed')
    }
  }
}

// Setup pagination event listeners
function setupPagination() {
  const prevBtn = document.getElementById('pagination-prev')
  const nextBtn = document.getElementById('pagination-next')
  const totalPages = Math.ceil(allBookings.length / bookingsPerPage)

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentPage > 0) {
        currentPage--
        renderCurrentPage()
      }
    })
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (currentPage < totalPages - 1) {
        currentPage++
        renderCurrentPage()
      }
    })
  }
}

// Update KPI cards
function updateKPIs(bookings) {
  // Upcoming calls = bookings from today onwards (we'll count recent ones as proxy)
  const now = new Date()
  const recentBookings = bookings.filter(b => {
    const bookingDate = new Date(b.occurred_at)
    const daysDiff = (now - bookingDate) / (1000 * 60 * 60 * 24)
    return daysDiff <= 7 // Last 7 days as "upcoming" proxy
  })

  const upcomingEl = document.getElementById('kpi-upcoming')
  if (upcomingEl) {
    upcomingEl.textContent = recentBookings.length
  }

  // High intent = users with 3+ events before booking OR score >= 80
  const highIntent = bookings.filter(b => 
    (b.recentEvents && b.recentEvents.length >= 3) || (b.intentScore && b.intentScore >= 80)
  )
  const highIntentEl = document.getElementById('kpi-high-intent')
  if (highIntentEl) {
    highIntentEl.textContent = highIntent.length
  }

  // Avg intent score = average of all calculated scores
  const avgQualEl = document.getElementById('kpi-avg-qual')
  if (avgQualEl && bookings.length > 0) {
    const totalScore = bookings.reduce((sum, b) => sum + (b.intentScore || 0), 0)
    const avgScore = Math.round(totalScore / bookings.length)
    avgQualEl.textContent = `${avgScore}%`
  }

  // Update sidebar badge
  const badgeEl = document.getElementById('bookings-badge')
  if (badgeEl) {
    badgeEl.textContent = bookings.length
  }
}

// Render bookings table
function renderBookingsTable(bookings) {
  const tbody = document.getElementById('bookings-tbody')
  if (!tbody) return

  if (!bookings || bookings.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="px-5 py-12 text-center text-zinc-500 text-sm">
          No bookings found.
        </td>
      </tr>
    `
    return
  }

  tbody.innerHTML = bookings.map((booking, index) => {
    const email = booking.email || 'Unknown'
    const initials = getInitials(email)
    const name = formatName(email)
    // Use pre-calculated score if available, otherwise calculate
    const intentScore = booking.intentScore ?? calculateIntentScore(booking)
    const intentLevel = getIntentLevel(intentScore)
    const recentEvents = booking.recentEvents?.slice(0, 3) || []
    const bookedFrom = getBookedFrom(booking)
    const avatarColor = getAvatarColor(index)

    return `
      <tr class="hover:bg-surfaceHighlight/20 transition-colors group">
        <!-- Intent Score -->
        <td class="px-5 py-4 align-middle w-16">
          <div class="flex flex-col items-center gap-1">
            <div class="relative w-9 h-9 flex items-center justify-center">
              <svg class="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path class="text-zinc-800" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3"></path>
                <path class="${intentLevel.color}" stroke-dasharray="${intentScore}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3" ${intentLevel.glow ? `style="filter: drop-shadow(0 0 3px ${intentLevel.glowColor})"` : ''}></path>
              </svg>
              <span class="absolute text-[10px] font-semibold ${intentLevel.textColor}">${intentScore}</span>
            </div>
            <span class="text-[9px] ${intentLevel.labelColor} font-medium uppercase">${intentLevel.label}</span>
          </div>
        </td>

        <!-- Lead & Meeting -->
        <td class="px-5 py-4 align-middle w-64">
          <div class="flex items-start gap-3">
            <div class="w-8 h-8 rounded-full ${avatarColor.bg} border ${avatarColor.border} flex items-center justify-center ${avatarColor.text} text-xs font-bold">
              ${initials}
            </div>
            <div>
              <div class="font-medium text-zinc-200 text-sm">${name}</div>
              <div class="text-[11px] text-zinc-500 mb-0.5">${email}</div>
              <div class="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-zinc-800/50 border border-zinc-700/50 text-zinc-400 text-[10px]">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path d="m22 8-6 4 6 4V8Z"></path><rect width="14" height="12" x="2" y="6" rx="2" ry="2"></rect></svg>
                Strategy Call
              </div>
            </div>
          </div>
        </td>

        <!-- Booked From -->
        <td class="px-5 py-4 align-middle w-56">
          <div class="flex items-center gap-1.5 text-zinc-400 w-fit">
            <div class="p-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-500">
              ${getPageIcon(bookedFrom.path)}
            </div>
            <span class="text-xs">${bookedFrom.display}</span>
          </div>
          <div class="text-[10px] text-zinc-600 mt-1 pl-1">
            ${formatDate(booking.occurred_at)}
          </div>
        </td>

        <!-- User Journey -->
        <td class="px-5 py-4 align-middle w-56">
          ${renderEventTimeline(recentEvents)}
        </td>

        <!-- AI Context -->
        <td class="px-5 py-4 align-middle w-40 text-center">
          <button class="relative inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 
            bg-gradient-to-b from-amber-500/10 to-orange-500/5 
            border border-amber-500/20 text-amber-200/90 
            hover:text-amber-100 hover:border-amber-500/50 hover:shadow-[0_0_15px_-4px_rgba(245,158,11,0.3)]">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 text-amber-400 animate-pulse"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg>
            Generate Insight
          </button>
        </td>

        <!-- More Options -->
        <td class="px-5 py-4 align-middle text-right">
          <button class="text-zinc-500 hover:text-zinc-200">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
          </button>
        </td>
      </tr>
    `
  }).join('')
}

// Process events to merge page_view with page_close for duration info
function processEventsWithDuration(events) {
  const processed = []
  const pageCloses = events.filter(e => e.event_name === 'page_close')
  const seenUrls = new Set() // Avoid duplicate pages

  for (const event of events) {
    // Skip page_close events - we use them only for duration
    if (event.event_name === 'page_close') continue

    if (event.event_name === 'page_view') {
      // Find matching page_close for this page view (same URL, same session, after the view)
      const matchingClose = pageCloses.find(c => 
        c.page_url === event.page_url && 
        c.session_id === event.session_id &&
        new Date(c.occurred_at) >= new Date(event.occurred_at)
      )
      
      const duration = matchingClose?.engaged_ms || 0
      const pageName = extractPageName(event.page_url)
      
      // Skip generic pages and duplicates
      if (pageName === 'All Courses' || pageName === 'All Lessons' || pageName === 'Sign In' || pageName === 'Home') continue
      if (pageName.toLowerCase().includes('all-courses') || pageName.toLowerCase().includes('all-lessons')) continue
      if (seenUrls.has(event.page_url)) continue
      seenUrls.add(event.page_url)

      processed.push({
        type: 'page_view',
        label: pageName,
        duration: duration,
        timestamp: event.occurred_at,
        page_url: event.page_url
      })
    } else if (event.event_name === 'book_call_click') {
      // Only show one book_call_click
      if (!processed.some(p => p.type === 'book_call_click')) {
        processed.push({
          type: 'book_call_click',
          label: 'Clicked Book Call',
          duration: 0,
          timestamp: event.occurred_at,
          cta_pos: event.cta_pos
        })
      }
    } else if (event.event_name === 'call_booked') {
      // Only show one call_booked
      if (!processed.some(p => p.type === 'call_booked')) {
        processed.push({
          type: 'call_booked',
          label: 'Call Booked',
          duration: 0,
          timestamp: event.occurred_at
        })
      }
    } else {
      // Other event types - skip duplicates
      const label = event.event_name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      if (!processed.some(p => p.label === label)) {
        processed.push({
          type: event.event_name,
          label: label,
          duration: 0,
          timestamp: event.occurred_at
        })
      }
    }
  }

  return processed.slice(0, 8) // Return top 8 meaningful events
}

// Extract readable page name from URL
function extractPageName(url) {
  try {
    const urlObj = new URL(url)
    const path = urlObj.pathname
    const hash = urlObj.hash

    // Handle hash-based navigation (skip if just # or error hash)
    if (hash && hash !== '#' && !hash.includes('error') && !hash.includes('access_token')) {
      const cleanHash = hash.replace('#', '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      if (cleanHash.length > 2) return cleanHash
    }

    if (path === '/' || path === '') return 'Home'
    if (path.includes('all-courses')) return 'All Courses'
    if (path.includes('all-lessons')) return 'All Lessons'
    if (path.includes('sign-in')) return 'Sign In'
    if (path.includes('masterclass')) return 'Masterclass'
    if (path.includes('pricing')) return 'Pricing'
    
    // Extract the last meaningful segment (skip generic ones)
    const parts = path.split('/').filter(Boolean)
    // Skip if it's just course name + all-lessons
    if (parts.length >= 2 && parts[parts.length - 1] === 'all-lessons') {
      return 'All Lessons'
    }
    
    if (parts.length > 0) {
      const lastPart = parts[parts.length - 1]
      return lastPart
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
    }
  } catch {
    // If URL parsing fails, return a fallback
  }
  return 'Page'
}

// Format duration from milliseconds to readable string
function formatDuration(ms) {
  if (!ms || ms <= 0) return ''
  
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (minutes < 60) {
    return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`
  }
  
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

// Calculate intent score based on user journey
function calculateIntentScore(booking) {
  const events = booking.recentEvents || []
  let score = 50 // Base score

  // More events = higher intent
  score += Math.min(events.length * 5, 25)

  // Specific high-value events
  events.forEach(e => {
    if (e.page_url?.includes('pricing')) score += 5
    if (e.page_url?.includes('masterclass')) score += 5
    if (e.page_url?.includes('case-study') || e.page_url?.includes('case-studies')) score += 3
    if (e.event_name === 'book_call_click') score += 10
    if (e.engaged_ms && e.engaged_ms > 60000) score += 5 // > 1 min engagement
  })

  // Check for UTM source (marketing qualified)
  if (booking.utm_source) score += 5

  return Math.min(score, 99)
}

// Get intent level styling
function getIntentLevel(score) {
  if (score >= 80) {
    return { 
      label: 'Hot', 
      color: 'text-emerald-500', 
      textColor: 'text-emerald-400',
      labelColor: 'text-emerald-500/70',
      glow: true,
      glowColor: 'rgba(16,185,129,0.5)'
    }
  } else if (score >= 60) {
    return { 
      label: 'Warm', 
      color: 'text-amber-500', 
      textColor: 'text-amber-400',
      labelColor: 'text-amber-500/70',
      glow: false
    }
  } else {
    return { 
      label: 'Cold', 
      color: 'text-zinc-500', 
      textColor: 'text-zinc-500',
      labelColor: 'text-zinc-600',
      glow: false
    }
  }
}

// Get booked from info
function getBookedFrom(booking) {
  // Check recent events for the page they came from
  const events = booking.recentEvents || []
  const lastPageView = events.find(e => e.event_name === 'page_view' || e.event_name === 'book_call_click')
  
  if (lastPageView?.page_url) {
    try {
      const url = new URL(lastPageView.page_url)
      return {
        path: url.pathname,
        display: url.pathname.length > 25 ? url.pathname.slice(0, 25) + '...' : url.pathname
      }
    } catch {
      return { path: '/unknown', display: lastPageView.page_url }
    }
  }

  // Fallback to booking source
  if (booking.page_url === 'hubspot_meetings') {
    return { path: '/hubspot', display: 'HubSpot Direct' }
  }

  return { path: '/direct', display: 'Direct Booking' }
}

// Get icon for page type
function getPageIcon(path) {
  if (path.includes('masterclass') || path.includes('replay')) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>'
  }
  if (path.includes('lesson') || path.includes('course')) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path d="M12 7v14"></path><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path></svg>'
  }
  if (path.includes('hubspot')) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path d="M13 2a9 9 0 0 1 9 9"></path><path d="M13 6a5 5 0 0 1 5 5"></path><path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"></path></svg>'
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><circle cx="12" cy="12" r="10"></circle><line x1="2" x2="22" y1="12" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>'
}

// Global tooltip element for bookings - created once and reused
let bookingsGlobalTooltip = null
let bookingsTooltipHideTimeout = null

function getBookingsGlobalTooltip() {
  if (!bookingsGlobalTooltip) {
    bookingsGlobalTooltip = document.createElement('div')
    bookingsGlobalTooltip.id = 'bookings-journey-tooltip'
    bookingsGlobalTooltip.className = 'hidden'
    bookingsGlobalTooltip.style.cssText = `
      position: fixed;
      width: 320px;
      padding: 16px;
      border-radius: 12px;
      z-index: 2147483647;
      background: #18181b;
      border: 1px solid #3f3f46;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(0,0,0,0.8);
      pointer-events: auto;
    `
    document.body.appendChild(bookingsGlobalTooltip)
    
    // Keep tooltip visible when hovering over it
    bookingsGlobalTooltip.addEventListener('mouseenter', () => {
      if (bookingsTooltipHideTimeout) {
        clearTimeout(bookingsTooltipHideTimeout)
        bookingsTooltipHideTimeout = null
      }
    })
    
    bookingsGlobalTooltip.addEventListener('mouseleave', () => {
      hideBookingsTooltipWithDelay()
    })
  }
  return bookingsGlobalTooltip
}

function hideBookingsTooltipWithDelay() {
  if (bookingsTooltipHideTimeout) clearTimeout(bookingsTooltipHideTimeout)
  bookingsTooltipHideTimeout = setTimeout(() => {
    const tooltip = getBookingsGlobalTooltip()
    tooltip.classList.add('hidden')
  }, 100)
}

function setupBookingsJourneyTooltips() {
  const triggers = document.querySelectorAll('.bookings-journey-trigger')
  
  triggers.forEach(trigger => {
    const tooltipId = trigger.dataset.tooltipId
    const eventCount = trigger.dataset.eventCount
    const template = document.getElementById(tooltipId + '-template')
    
    if (!template) return
    
    trigger.addEventListener('mouseenter', (e) => {
      // Cancel any pending hide
      if (bookingsTooltipHideTimeout) {
        clearTimeout(bookingsTooltipHideTimeout)
        bookingsTooltipHideTimeout = null
      }
      
      const tooltip = getBookingsGlobalTooltip()
      const rect = trigger.getBoundingClientRect()
      
      // Position tooltip below the trigger, aligned to the right
      tooltip.style.top = (rect.bottom + 8) + 'px'
      tooltip.style.left = (rect.right - 320) + 'px'
      
      // Check if tooltip would go off screen to the left
      if (rect.right - 320 < 8) {
        tooltip.style.left = '8px'
      }
      
      // Check if tooltip would go off screen to the bottom
      const viewportHeight = window.innerHeight
      if (rect.bottom + 8 + 300 > viewportHeight) {
        tooltip.style.top = (rect.top - 308) + 'px'
      }
      
      tooltip.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #27272a;">
          <span style="font-size: 10px; font-weight: 600; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.05em;">Full Journey</span>
          <span style="font-size: 10px; color: #52525b;">${eventCount} events</span>
        </div>
        <div style="position: relative; max-height: 256px; overflow-y: auto; background: #18181b;">
          <div style="position: absolute; top: 8px; bottom: 8px; left: 11px; width: 1px; background: #3f3f46;"></div>
          ${template.innerHTML}
        </div>
      `
      tooltip.classList.remove('hidden')
    })
    
    trigger.addEventListener('mouseleave', () => {
      hideBookingsTooltipWithDelay()
    })
  })
}

// Render event timeline - horizontal dash with hoverable + for details
function renderEventTimeline(events) {
  if (!events || events.length === 0) {
    return `<div class="text-xs text-zinc-600 text-center">No prior events</div>`
  }

  // Take the 3 most recent events for the horizontal view
  // events is Newest -> Oldest
  // We reverse them to show Old -> New (Left -> Right) in the horizontal timeline
  const recentEvents = events.slice(0, 3).reverse()
  
  // Only show + if there are more than 3 events
  const hasMoreEvents = events.length > 3
  const tooltipEvents = events.slice(0, 10)
  const tooltipContent = renderVerticalTimelineItems(tooltipEvents)
  const tooltipId = 'bjt-' + Math.random().toString(36).substr(2, 9)

  // Generate Horizontal Bubbles
  const bubblesHtml = recentEvents.map((e) => {
    const icon = getProcessedEventIcon(e.type)
    const colorClass = getEventColor(e.type)
    return `
      <div class="relative group/bubble">
        <div class="w-6 h-6 rounded-full ${colorClass} border border-zinc-700/50 flex items-center justify-center shadow-sm transition-transform hover:scale-110 cursor-default">
          ${icon}
        </div>
        <!-- Simple Tooltip for individual bubbles -->
        <div class="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-[10px] text-zinc-300 opacity-0 invisible group-hover/bubble:opacity-100 group-hover/bubble:visible transition-all whitespace-nowrap" style="z-index: 10;">
          ${e.label}
        </div>
      </div>
    `
  }).join('<div class="w-4 h-px bg-zinc-700/50"></div>')

  // The (+) Trigger Node - only show if more than 3 events
  const plusHtml = hasMoreEvents ? `
    <div class="w-4 h-px bg-zinc-700/50"></div>
    <div class="relative">
      <div class="bookings-journey-trigger w-6 h-6 rounded-full bg-zinc-800 border border-zinc-600 text-zinc-400 hover:text-white hover:border-zinc-400 hover:bg-zinc-700 flex items-center justify-center shadow-sm transition-all cursor-help" data-tooltip-id="${tooltipId}" data-event-count="${events.length}">
        <span class="text-[10px] font-medium">+${events.length - 3}</span>
      </div>
      <template id="${tooltipId}-template">
        ${tooltipContent}
      </template>
    </div>
  ` : ''

  return `
    <div class="flex items-center justify-center w-full">
      ${bubblesHtml}
      ${plusHtml}
    </div>
  `
}

// Helper to render vertical items for tooltip
function renderVerticalTimelineItems(events) {
  return events.map((e) => {
    const icon = getProcessedEventIcon(e.type)
    const isHighlight = e.type === 'book_call_click' || e.type === 'call_booked'
    const dotColor = isHighlight ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-zinc-800 text-zinc-400 border-zinc-700'
    const textColor = isHighlight ? 'text-amber-100' : 'text-zinc-300'
    const timeStr = formatDate(e.timestamp)
    const duration = e.duration > 0 ? `<span class="ml-1 text-zinc-500 font-normal">(${formatDuration(e.duration)})</span>` : ''

    return `
      <div class="relative flex gap-3 items-start py-1.5 group/item">
        <div class="relative z-10 flex-shrink-0 w-6 h-6 rounded-full ${dotColor} border flex items-center justify-center text-[10px]">
          ${icon}
        </div>
        <div class="flex-1 min-w-0 pt-0.5">
          <div class="text-[11px] font-medium ${textColor} leading-tight" style="word-wrap: break-word;">
            ${e.label} ${duration}
          </div>
          <div class="text-[9px] text-zinc-600 mt-0.5">
            ${timeStr}
          </div>
        </div>
      </div>
    `
  }).join('')
}

// Get color styling for event types
function getEventColor(type) {
  if (type === 'call_booked') return 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
  if (type === 'book_call_click') return 'bg-amber-500/20 border-amber-500/40 text-amber-400'
  if (type === 'page_view') return 'bg-zinc-800 border-zinc-700 text-zinc-400'
  return 'bg-zinc-800 border-zinc-700 text-zinc-500'
}

// Get icon for processed event type
function getProcessedEventIcon(type) {
  // Phone icon for book call click
  if (type === 'book_call_click') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`
  }
  // Checkmark icon for call booked
  if (type === 'call_booked') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`
  }
  // Eye icon for page view
  if (type === 'page_view') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>`
  }
  // Default: dot icon
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><circle cx="12" cy="12" r="4"></circle></svg>`
}

// Get icon for event type
function getEventIcon(event) {
  const type = event.event_name
  const url = event.page_url || ''

  if (type === 'book_call_click') {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path d="M13 2a9 9 0 0 1 9 9"></path><path d="M13 6a5 5 0 0 1 5 5"></path><path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"></path></svg>'
  }
  if (type === 'page_view') {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>'
  }
  if (type === 'page_close') {
    if (event.engaged_ms && event.engaged_ms > 30000) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>'
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>'
  }

  return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><circle cx="12" cy="12" r="1"></circle></svg>'
}

// Get label for event
function getEventLabel(event) {
  const type = event.event_name
  const url = event.page_url || ''

  if (type === 'book_call_click') {
    return 'Clicked Book Call'
  }
  if (type === 'page_view') {
    const pageName = getPageName(url)
    return `Viewed ${pageName}`
  }
  if (type === 'page_close') {
    const pageName = getPageName(url)
    const duration = event.engaged_ms ? ` (${Math.round(event.engaged_ms / 1000)}s)` : ''
    return `Left ${pageName}${duration}`
  }

  return type.replace(/_/g, ' ')
}

// Get readable page name from URL
function getPageName(url) {
  try {
    const path = new URL(url).pathname
    if (path === '/' || path === '/home') return 'Home'
    if (path.includes('all-courses')) return 'All Courses'
    if (path.includes('all-lessons')) return 'Lessons'
    if (path.includes('masterclass')) return 'Masterclass'
    if (path.includes('pricing')) return 'Pricing'
    
    // Extract course/lesson name
    const parts = path.split('/').filter(Boolean)
    if (parts.length > 0) {
      return parts[parts.length - 1]
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .slice(0, 20)
    }
  } catch {}
  return 'Page'
}

// Helper functions
function getInitials(email) {
  const name = email.split('@')[0]
  const parts = name.split(/[._]/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

function formatName(email) {
  const name = email.split('@')[0]
  return name
    .replace(/[._]/g, ' ')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function formatDate(dateStr) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now - date
  const diffHours = diffMs / (1000 * 60 * 60)
  const diffDays = diffMs / (1000 * 60 * 60 * 24)

  if (diffHours < 1) return 'Just now'
  if (diffHours < 24) return `${Math.floor(diffHours)}h ago`
  if (diffDays < 7) return `${Math.floor(diffDays)}d ago`
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getAvatarColor(index) {
  const colors = [
    { bg: 'bg-gradient-to-br from-indigo-500/20 to-purple-500/20', border: 'border-indigo-500/30', text: 'text-indigo-300' },
    { bg: 'bg-zinc-800', border: 'border-zinc-700', text: 'text-zinc-400' },
    { bg: 'bg-gradient-to-br from-emerald-500/20 to-teal-500/20', border: 'border-emerald-500/30', text: 'text-emerald-300' },
    { bg: 'bg-gradient-to-br from-amber-500/20 to-orange-500/20', border: 'border-amber-500/30', text: 'text-amber-300' },
    { bg: 'bg-gradient-to-br from-pink-500/20 to-rose-500/20', border: 'border-pink-500/30', text: 'text-pink-300' },
  ]
  return colors[index % colors.length]
}

// Sort bookings based on current sort selection
function sortBookings() {
  if (currentSort === 'intent') {
    // Sort by intent score (desc), then by event count (desc)
    allBookings.sort((a, b) => {
      if (b.intentScore !== a.intentScore) {
        return b.intentScore - a.intentScore
      }
      return b.eventCount - a.eventCount
    })
  } else {
    // Sort by date (most recent first)
    allBookings.sort((a, b) => {
      return new Date(b.occurred_at) - new Date(a.occurred_at)
    })
  }
}

// Setup sort dropdown
function setupSort() {
  const sortSelect = document.getElementById('sort-select')
  if (!sortSelect) return
  
  sortSelect.addEventListener('change', (e) => {
    currentSort = e.target.value
    sortBookings()
    currentPage = 0
    renderCurrentPage()
  })
}

// Setup search functionality
function setupSearch() {
  const searchInput = document.getElementById('search-input')
  if (!searchInput) return

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim()
    
    if (query === '') {
      // Reset to paginated view
      currentPage = 0
      renderCurrentPage()
    } else {
      // Filter and show all matching results
      const filtered = allBookings.filter(b => 
        b.email?.toLowerCase().includes(query) ||
        formatName(b.email || '').toLowerCase().includes(query)
      )
      renderBookingsTable(filtered)
      
      // Update pagination info for search results
      const infoEl = document.getElementById('pagination-info')
      if (infoEl) {
        infoEl.textContent = `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`
      }
    }
  })
}

// Export Bookings to Excel
function setupExportBookings() {
  const exportBtn = document.getElementById('export-bookings-btn')
  if (!exportBtn) return
  
  exportBtn.addEventListener('click', () => {
    const now = new Date()
    const dateStr = now.toISOString().split('T')[0]
    
    // Create workbook
    const wb = XLSX.utils.book_new()
    
    // Calculate stats
    const recentBookings = allBookings.filter(b => {
      const bookingDate = new Date(b.occurred_at)
      const daysDiff = (now - bookingDate) / (1000 * 60 * 60 * 24)
      return daysDiff <= 7
    })
    
    const highIntent = allBookings.filter(b => 
      (b.recentEvents && b.recentEvents.length >= 3) || (b.intentScore && b.intentScore >= 80)
    )
    
    const avgIntentScore = allBookings.length > 0 
      ? Math.round(allBookings.reduce((sum, b) => sum + (b.intentScore || 0), 0) / allBookings.length)
      : 0
    
    // --- Sheet 1: Summary ---
    const summaryData = [
      [''],
      ['', 'VENDINGPRENEURS BOOKINGS REPORT'],
      [''],
      ['', 'Generated:', now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })],
      ['', 'Time:', now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })],
      [''],
      [''],
      ['', 'BOOKINGS OVERVIEW', ''],
      [''],
      ['', 'Total Bookings', allBookings.length],
      ['', 'Last 7 Days', recentBookings.length],
      ['', 'High Intent Leads', highIntent.length],
      ['', 'Average Intent Score', `${avgIntentScore}%`],
      [''],
      [''],
      ['', 'INTENT SCORE BREAKDOWN', ''],
      [''],
      ['', 'Hot (80+)', allBookings.filter(b => b.intentScore >= 80).length],
      ['', 'Warm (60-79)', allBookings.filter(b => b.intentScore >= 60 && b.intentScore < 80).length],
      ['', 'Cold (<60)', allBookings.filter(b => b.intentScore < 60).length],
    ]
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
    wsSummary['!cols'] = [{ wch: 5 }, { wch: 30 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')
    
    // --- Sheet 2: All Bookings ---
    const bookingsData = [
      [''],
      ['', 'ALL BOOKINGS'],
      ['', 'Sorted by Intent Score (Descending)'],
      [''],
      [''],
      ['', '#', 'EMAIL', 'NAME', 'INTENT SCORE', 'INTENT LEVEL', 'EVENTS', 'BOOKED DATE'],
      ['']
    ]
    
    allBookings.forEach((booking, index) => {
      const intentLevel = getIntentLevel(booking.intentScore)
      const date = new Date(booking.occurred_at)
      
      bookingsData.push([
        '',
        index + 1,
        booking.email || 'Unknown',
        formatName(booking.email || ''),
        `${booking.intentScore}%`,
        intentLevel.label,
        booking.eventCount,
        date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      ])
    })
    
    bookingsData.push([''])
    bookingsData.push(['', '─'.repeat(80)])
    bookingsData.push(['', 'TOTAL BOOKINGS', allBookings.length])
    
    const wsBookings = XLSX.utils.aoa_to_sheet(bookingsData)
    wsBookings['!cols'] = [{ wch: 5 }, { wch: 5 }, { wch: 35 }, { wch: 20 }, { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, wsBookings, 'All Bookings')
    
    // --- Sheet 3: Hot Leads ---
    const hotLeads = allBookings.filter(b => b.intentScore >= 80)
    if (hotLeads.length > 0) {
      const hotData = [
        [''],
        ['', 'HOT LEADS (Intent Score 80+)'],
        ['', 'Priority contacts for follow-up'],
        [''],
        [''],
        ['', '#', 'EMAIL', 'INTENT SCORE', 'EVENTS', 'BOOKED DATE', 'TOP PAGES VIEWED'],
        ['']
      ]
      
      hotLeads.forEach((booking, index) => {
        const date = new Date(booking.occurred_at)
        const topPages = (booking.recentEvents || [])
          .filter(e => e.type === 'page_view')
          .slice(0, 3)
          .map(e => e.label)
          .join(', ') || 'N/A'
        
        hotData.push([
          '',
          index + 1,
          booking.email || 'Unknown',
          `${booking.intentScore}%`,
          booking.eventCount,
          date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          topPages
        ])
      })
      
      const wsHot = XLSX.utils.aoa_to_sheet(hotData)
      wsHot['!cols'] = [{ wch: 5 }, { wch: 5 }, { wch: 35 }, { wch: 14 }, { wch: 8 }, { wch: 14 }, { wch: 40 }]
      XLSX.utils.book_append_sheet(wb, wsHot, 'Hot Leads')
    }
    
    // --- Sheet 4: Recent Bookings (7 days) ---
    if (recentBookings.length > 0) {
      const recentData = [
        [''],
        ['', 'RECENT BOOKINGS (Last 7 Days)'],
        [''],
        [''],
        ['', '#', 'EMAIL', 'INTENT SCORE', 'EVENTS', 'BOOKED DATE'],
        ['']
      ]
      
      recentBookings.forEach((booking, index) => {
        const date = new Date(booking.occurred_at)
        
        recentData.push([
          '',
          index + 1,
          booking.email || 'Unknown',
          `${booking.intentScore}%`,
          booking.eventCount,
          date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
        ])
      })
      
      const wsRecent = XLSX.utils.aoa_to_sheet(recentData)
      wsRecent['!cols'] = [{ wch: 5 }, { wch: 5 }, { wch: 35 }, { wch: 14 }, { wch: 8 }, { wch: 25 }]
      XLSX.utils.book_append_sheet(wb, wsRecent, 'Recent (7 Days)')
    }
    
    // Download the file
    XLSX.writeFile(wb, `VendingPreneurs-Bookings-${dateStr}.xlsx`)
  })
}

// Run on load
loadBookings().then(() => {
  setupExportBookings()
})

