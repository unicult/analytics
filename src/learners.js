import { createClient } from '@supabase/supabase-js'

// Initialize Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// State
let allLearners = []
let filteredLearners = []
let currentPage = 1
let pageSize = 25 // Default page size
let currentFilter = 'all' // 'all', 'active', 'offline', 'top', 'converted'
let searchQuery = ''
let topUsersWithEvents = new Map() // Cache for user events when in "top" filter
let convertedEmails = new Set() // Cache for converted user emails

// Frontend course keys
const FRONTEND_KEYS = [
  'Profit Machine System',
  'Profit Machine Maximizer', 
  'Rapid Scaling Blueprint',
  'Profit Machine Maximizer (3-Pay plan)'
]

// Helper: Format relative time
function formatRelativeTime(dateStr) {
  if (!dateStr) return 'Never'
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
  return `${Math.floor(diffDays / 365)} years ago`
}

// Helper: Format "Since" date
function formatSinceDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const options = { month: 'short', year: 'numeric' }
  return `Since ${date.toLocaleDateString('en-US', options)}`
}

// Helper: Get initials from email
function getInitials(email) {
  if (!email) return 'NA'
  const parts = email.split('@')[0].split(/[._-]/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return email.substring(0, 2).toUpperCase()
}

// Helper: Get status badge HTML
function getStatusBadge(status) {
  // Normalize status: active stays active, everything else is offline
  const normalizedStatus = status === 'active' ? 'active' : 'offline'
  
  const statusConfig = {
    active: {
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-400',
      border: 'border-emerald-500/20',
      dot: 'bg-emerald-500',
      label: 'Active'
    },
    offline: {
      bg: 'bg-zinc-500/10',
      text: 'text-zinc-400',
      border: 'border-zinc-500/20',
      dot: 'bg-zinc-500',
      label: 'Offline'
    }
  }
  
  const config = statusConfig[normalizedStatus]
  
  return `
    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text} border ${config.border}">
      <span class="w-1.5 h-1.5 rounded-full ${config.dot}"></span>
      ${config.label}
    </span>
  `
}

// Helper: Render courses badges
function renderCourses(courses) {
  if (!courses || courses.length === 0) {
    return '<span class="text-xs text-zinc-600 italic">No courses enrolled</span>'
  }
  
  return courses.map(course => `
    <span class="inline-flex items-center px-2 py-1 rounded text-[11px] font-medium bg-zinc-800 border border-zinc-700 text-zinc-300">${course}</span>
  `).join('')
}

// ============ USER JOURNEY TIMELINE FUNCTIONS ============

// Process events to merge page_view with page_close for duration info
function processEventsWithDuration(events) {
  const processed = []
  const pageCloses = events.filter(e => e.event_name === 'page_close')
  const seenUrls = new Set()

  for (const event of events) {
    if (event.event_name === 'page_close') continue

    if (event.event_name === 'page_view') {
      const matchingClose = pageCloses.find(c => 
        c.page_url === event.page_url && 
        c.session_id === event.session_id &&
        new Date(c.occurred_at) >= new Date(event.occurred_at)
      )
      
      const duration = matchingClose?.engaged_ms || 0
      const pageName = extractPageName(event.page_url)
      
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
      if (!processed.some(p => p.type === 'book_call_click')) {
        processed.push({
          type: 'book_call_click',
          label: 'Clicked Book Call',
          duration: 0,
          timestamp: event.occurred_at
        })
      }
    } else if (event.event_name === 'call_booked') {
      if (!processed.some(p => p.type === 'call_booked')) {
        processed.push({
          type: 'call_booked',
          label: 'Call Booked',
          duration: 0,
          timestamp: event.occurred_at
        })
      }
    }
  }

  return processed.slice(0, 8)
}

// Extract readable page name from URL
function extractPageName(url) {
  try {
    const urlObj = new URL(url)
    const path = urlObj.pathname
    const hash = urlObj.hash

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
    
    const parts = path.split('/').filter(Boolean)
    if (parts.length >= 2 && parts[parts.length - 1] === 'all-lessons') {
      return 'All Lessons'
    }
    
    if (parts.length > 0) {
      const lastPart = parts[parts.length - 1]
      return lastPart
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
    }
  } catch {}
  return 'Page'
}

// Format duration from milliseconds
function formatDuration(ms) {
  if (!ms || ms <= 0) return ''
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (minutes < 60) return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

// Get icon for processed event type
function getProcessedEventIcon(type) {
  if (type === 'book_call_click') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`
  }
  if (type === 'call_booked') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`
  }
  if (type === 'page_view') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><circle cx="12" cy="12" r="4"></circle></svg>`
}

// Get color styling for event types
function getEventColor(type) {
  if (type === 'call_booked') return 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
  if (type === 'book_call_click') return 'bg-amber-500/20 border-amber-500/40 text-amber-400'
  if (type === 'page_view') return 'bg-zinc-800 border-zinc-700 text-zinc-400'
  return 'bg-zinc-800 border-zinc-700 text-zinc-500'
}

// Render event timeline - horizontal dash with hoverable + for details
function renderEventTimeline(events) {
  if (!events || events.length === 0) {
    return `<div class="text-xs text-zinc-600 text-center">No events</div>`
  }

  const recentEvents = events.slice(0, 3).reverse()
  const hasMoreEvents = events.length > 3
  const tooltipEvents = events.slice(0, 10)

  const bubblesHtml = recentEvents.map((e) => {
    const icon = getProcessedEventIcon(e.type)
    const colorClass = getEventColor(e.type)
    return `
      <div class="relative group/bubble">
        <div class="w-6 h-6 rounded-full ${colorClass} border border-zinc-700/50 flex items-center justify-center shadow-sm transition-transform hover:scale-110 cursor-default">
          ${icon}
        </div>
        <div class="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-[10px] text-zinc-300 opacity-0 invisible group-hover/bubble:opacity-100 group-hover/bubble:visible transition-all whitespace-nowrap" style="z-index: 10;">
          ${e.label}
        </div>
      </div>
    `
  }).join('<div class="w-4 h-px bg-zinc-700/50"></div>')

  const tooltipId = 'jt-' + Math.random().toString(36).substr(2, 9)
  const tooltipContent = renderVerticalTimelineItems(tooltipEvents)
  const eventCount = events.length
  
  const plusHtml = hasMoreEvents ? `
    <div class="w-4 h-px bg-zinc-700/50"></div>
    <div class="relative">
      <div class="journey-plus-trigger w-6 h-6 rounded-full bg-zinc-800 border border-zinc-600 text-zinc-400 hover:text-white hover:border-zinc-400 hover:bg-zinc-700 flex items-center justify-center shadow-sm transition-all cursor-help" data-tooltip-id="${tooltipId}" data-event-count="${eventCount}">
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
    const timeStr = formatRelativeTime(e.timestamp)
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

// Global tooltip element - created once and reused
let globalTooltip = null
let tooltipHideTimeout = null

function getGlobalTooltip() {
  if (!globalTooltip) {
    globalTooltip = document.createElement('div')
    globalTooltip.id = 'journey-global-tooltip'
    globalTooltip.className = 'hidden'
    globalTooltip.style.cssText = `
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
    document.body.appendChild(globalTooltip)
    
    // Keep tooltip visible when hovering over it
    globalTooltip.addEventListener('mouseenter', () => {
      if (tooltipHideTimeout) {
        clearTimeout(tooltipHideTimeout)
        tooltipHideTimeout = null
      }
    })
    
    globalTooltip.addEventListener('mouseleave', () => {
      hideTooltipWithDelay()
    })
  }
  return globalTooltip
}

function hideTooltipWithDelay() {
  if (tooltipHideTimeout) clearTimeout(tooltipHideTimeout)
  tooltipHideTimeout = setTimeout(() => {
    const tooltip = getGlobalTooltip()
    tooltip.classList.add('hidden')
  }, 100)
}

function setupJourneyTooltips() {
  const triggers = document.querySelectorAll('.journey-plus-trigger')
  
  triggers.forEach(trigger => {
    const tooltipId = trigger.dataset.tooltipId
    const eventCount = trigger.dataset.eventCount
    const template = document.getElementById(tooltipId + '-template')
    
    if (!template) return
    
    trigger.addEventListener('mouseenter', (e) => {
      // Cancel any pending hide
      if (tooltipHideTimeout) {
        clearTimeout(tooltipHideTimeout)
        tooltipHideTimeout = null
      }
      
      const tooltip = getGlobalTooltip()
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
      hideTooltipWithDelay()
    })
  })
}

// Render a single learner row
function renderLearnerRow(learner) {
  const initials = getInitials(learner.email)
  const isOnline = learner.status === 'active'
  const showJourney = currentFilter === 'top'
  const isConverted = convertedEmails.has(learner.email)
  
  // Get processed events for this user if in top filter
  const userEvents = showJourney ? (topUsersWithEvents.get(learner.email) || []) : []
  
  return `
    <tr class="hover:bg-surfaceHighlight/20 transition-colors group">
      <td class="px-6 py-4">
        <div class="flex items-center gap-3">
          <div class="relative">
            <div class="w-9 h-9 rounded-full ${isConverted ? 'bg-emerald-500/20 border-emerald-500/40' : 'bg-zinc-800 border-zinc-700'} border flex items-center justify-center text-xs font-medium ${isConverted ? 'text-emerald-300' : 'text-zinc-300'}">
              ${initials}
            </div>
            ${isOnline ? `
              <div class="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-background rounded-full flex items-center justify-center">
                <div class="w-2 h-2 bg-emerald-500 rounded-full"></div>
              </div>
            ` : ''}
          </div>
          <div class="flex flex-col">
            <div class="flex items-center gap-2">
              <span class="text-zinc-200 text-sm font-medium">${learner.email.split('@')[0]}</span>
              ${isConverted ? `<span class="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded">Converted</span>` : ''}
            </div>
            <span class="text-xs text-zinc-500">${learner.email}</span>
          </div>
        </div>
      </td>
      <td class="px-6 py-4">
        <div class="flex flex-wrap gap-1.5 max-w-md">
          ${renderCourses(learner.courses)}
        </div>
      </td>
      <td class="px-6 py-4 text-right">
        <div class="flex flex-col items-end">
          <span class="text-zinc-300 font-medium">${learner.active_days_30d} days</span>
          <span class="text-xs text-zinc-600">${formatSinceDate(learner.first_activity_at)}</span>
        </div>
      </td>
      <td class="px-6 py-4 text-right">
        <span class="text-zinc-400 font-mono">${learner.total_events.toLocaleString()}</span>
      </td>
      <td class="px-6 py-4 text-right">
        ${getStatusBadge(learner.status)}
      </td>
      ${showJourney ? `
        <td class="px-6 py-4 w-56 text-center">
          ${renderEventTimeline(userEvents)}
        </td>
      ` : ''}
      <td class="px-6 py-4">
        <button class="p-1 text-zinc-600 hover:text-zinc-300 transition-colors opacity-0 group-hover:opacity-100">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
        </button>
      </td>
    </tr>
  `
}

// Apply filters and search
async function applyFilters() {
  // Special case: Top Active Users shows top 100 users with events > 1, sorted by event count
  if (currentFilter === 'top') {
    filteredLearners = [...allLearners]
      .filter(l => l.total_events > 1)
      .sort((a, b) => b.total_events - a.total_events)
      .slice(0, 100)
    
    // Apply search filter on top of that
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filteredLearners = filteredLearners.filter(learner => {
        const emailMatch = learner.email.toLowerCase().includes(query)
        const courseMatch = learner.courses && learner.courses.some(c => c.toLowerCase().includes(query))
        return emailMatch || courseMatch
      })
    }
    
    // Fetch events for top users (for User Journey column)
    await fetchEventsForTopUsers(filteredLearners.slice(0, 20)) // Fetch for first page
    
    // Show User Journey column header
    const journeyHeader = document.getElementById('journey-header')
    if (journeyHeader) journeyHeader.classList.remove('hidden')
  } else if (currentFilter === 'converted') {
    // Converted users: have a backend product AND have a frontend product
    filteredLearners = allLearners.filter(learner => {
      // Check if user is converted (in the converted set)
      const isConverted = convertedEmails.has(learner.email)
      if (!isConverted) return false
      
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const emailMatch = learner.email.toLowerCase().includes(query)
        const courseMatch = learner.courses && learner.courses.some(c => c.toLowerCase().includes(query))
        if (!emailMatch && !courseMatch) return false
      }
      
      return true
    })
    
    // Hide User Journey column header
    const journeyHeader = document.getElementById('journey-header')
    if (journeyHeader) journeyHeader.classList.add('hidden')
    topUsersWithEvents.clear()
  } else {
    // Hide User Journey column header for other filters
    const journeyHeader = document.getElementById('journey-header')
    if (journeyHeader) journeyHeader.classList.add('hidden')
    topUsersWithEvents.clear()
    
    filteredLearners = allLearners.filter(learner => {
      // Status filter (normalize: active = active, everything else = offline)
      const normalizedStatus = learner.status === 'active' ? 'active' : 'offline'
      if (currentFilter !== 'all' && currentFilter !== 'converted' && normalizedStatus !== currentFilter) return false
      
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const emailMatch = learner.email.toLowerCase().includes(query)
        const courseMatch = learner.courses && learner.courses.some(c => c.toLowerCase().includes(query))
        if (!emailMatch && !courseMatch) return false
      }
      
      return true
    })
    
    // Sort "All Users" by granted_at (most recent first)
    if (currentFilter === 'all') {
      filteredLearners.sort((a, b) => {
        const dateA = a.granted_at ? new Date(a.granted_at) : new Date(0)
        const dateB = b.granted_at ? new Date(b.granted_at) : new Date(0)
        return dateB - dateA
      })
    }
  }
  
  currentPage = 1
  renderTable()
  updateFilterCounts()
}

// Fetch events for top users to display User Journey
async function fetchEventsForTopUsers(users) {
  const emails = users.map(u => u.email)
  
  // Fetch recent events for these users
  const { data: events, error } = await supabase
    .from('analytics_events')
    .select('*')
    .in('email', emails)
    .order('occurred_at', { ascending: false })
    .limit(500) // Get enough events for all users
  
  if (error) {
    console.error('Error fetching user events:', error)
    return
  }
  
  // Group events by email and process them
  const eventsByEmail = {}
  events?.forEach(event => {
    if (!eventsByEmail[event.email]) {
      eventsByEmail[event.email] = []
    }
    eventsByEmail[event.email].push(event)
  })
  
  // Process and store events for each user
  Object.entries(eventsByEmail).forEach(([email, userEvents]) => {
    const processed = processEventsWithDuration(userEvents)
    topUsersWithEvents.set(email, processed)
  })
}

// Update filter button counts
function updateFilterCounts() {
  const counts = {
    all: allLearners.length,
    active: allLearners.filter(l => l.status === 'active').length,
    offline: allLearners.filter(l => l.status !== 'active').length,
    converted: allLearners.filter(l => convertedEmails.has(l.email)).length
  }
  
  const buttons = {
    all: { el: document.getElementById('filter-all'), dot: '' },
    active: { el: document.getElementById('filter-active'), dot: '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>' },
    offline: { el: document.getElementById('filter-offline'), dot: '<span class="w-1.5 h-1.5 rounded-full bg-zinc-500"></span>' }
  }
  
  Object.entries(buttons).forEach(([key, { el, dot }]) => {
    if (el) {
      const label = key === 'all' ? 'All' : key.charAt(0).toUpperCase() + key.slice(1)
      el.innerHTML = `${dot}${label} <span class="bg-zinc-700 px-1.5 rounded-full text-[10px] ml-1">${counts[key].toLocaleString()}</span>`
    }
  })
  
  // Update converted button with count
  const convertedBtn = document.getElementById('filter-converted')
  if (convertedBtn && counts.converted > 0) {
    convertedBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-400"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>Converted <span class="bg-emerald-500/30 px-1.5 rounded-full text-[10px] ml-1">${counts.converted}</span>`
  }
}

// Render the table
async function renderTable() {
  const tbody = document.getElementById('learners-tbody')
  if (!tbody) return
  
  const start = (currentPage - 1) * pageSize
  const end = start + pageSize
  const pageData = filteredLearners.slice(start, end)
  
  // If in "top" filter, fetch events for users on this page that we haven't fetched yet
  if (currentFilter === 'top' && pageData.length > 0) {
    const usersNeedingEvents = pageData.filter(u => !topUsersWithEvents.has(u.email))
    if (usersNeedingEvents.length > 0) {
      await fetchEventsForTopUsers(usersNeedingEvents)
    }
  }
  
  const colspan = currentFilter === 'top' ? 7 : 6
  
  if (pageData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${colspan}" class="px-6 py-12 text-center text-zinc-500">
          <div class="flex flex-col items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8 text-zinc-600"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            <span>No learners found</span>
          </div>
        </td>
      </tr>
    `
  } else {
    tbody.innerHTML = pageData.map(renderLearnerRow).join('')
  }
  
  renderPagination()
  setupJourneyTooltips()
}

// Render pagination
function renderPagination() {
  const totalPages = Math.ceil(filteredLearners.length / pageSize)
  const paginationInfo = document.getElementById('pagination-info')
  const paginationControls = document.getElementById('pagination-controls')
  
  if (paginationInfo) {
    const start = (currentPage - 1) * pageSize + 1
    const end = Math.min(currentPage * pageSize, filteredLearners.length)
    paginationInfo.textContent = `Showing ${start} to ${end} of ${filteredLearners.length.toLocaleString()} learners`
  }
  
  if (paginationControls) {
    let html = `
      <button id="prev-page" class="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 ${currentPage === 1 ? 'disabled:opacity-50 disabled:cursor-not-allowed' : ''}" ${currentPage === 1 ? 'disabled' : ''}>
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="m15 18-6-6 6-6"></path></svg>
      </button>
    `
    
    // Page numbers
    const pagesToShow = []
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pagesToShow.push(i)
    } else {
      pagesToShow.push(1)
      if (currentPage > 3) pagesToShow.push('...')
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
        pagesToShow.push(i)
      }
      if (currentPage < totalPages - 2) pagesToShow.push('...')
      pagesToShow.push(totalPages)
    }
    
    pagesToShow.forEach(page => {
      if (page === '...') {
        html += `<span class="text-zinc-600 text-xs px-1">...</span>`
      } else {
        const isActive = page === currentPage
        html += `
          <button class="page-btn min-w-[32px] h-8 flex items-center justify-center rounded-md text-xs font-medium ${isActive ? 'bg-zinc-800 text-zinc-200 border border-zinc-700' : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50'}" data-page="${page}">
            ${page}
          </button>
        `
      }
    })
    
    html += `
      <button id="next-page" class="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 ${currentPage === totalPages ? 'disabled:opacity-50 disabled:cursor-not-allowed' : ''}" ${currentPage === totalPages ? 'disabled' : ''}>
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="m9 18 6-6-6-6"></path></svg>
      </button>
    `
    
    paginationControls.innerHTML = html
    
    // Add event listeners
    document.getElementById('prev-page')?.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--
        renderTable()
      }
    })
    
    document.getElementById('next-page')?.addEventListener('click', () => {
      if (currentPage < totalPages) {
        currentPage++
        renderTable()
      }
    })
    
    document.querySelectorAll('.page-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        currentPage = parseInt(e.target.dataset.page)
        renderTable()
      })
    })
  }
}

// Set active filter button styling
function setActiveFilter(filter) {
  currentFilter = filter
  
  const buttons = {
    all: document.getElementById('filter-all'),
    active: document.getElementById('filter-active'),
    offline: document.getElementById('filter-offline'),
    top: document.getElementById('filter-top')
  }
  
  Object.entries(buttons).forEach(([key, btn]) => {
    if (!btn) return
    if (key === 'top') {
      // Special styling for Top Active button
      if (key === filter) {
        btn.className = 'px-3 py-1.5 text-xs font-medium text-amber-100 bg-gradient-to-r from-amber-500/40 via-orange-500/40 to-yellow-500/40 border border-amber-400/50 rounded transition-all whitespace-nowrap flex items-center gap-1.5 shadow-[0_0_16px_rgba(251,191,36,0.25)]'
      } else {
        btn.className = 'px-3 py-1.5 text-xs font-medium text-amber-200 bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-yellow-500/20 border border-amber-500/30 rounded transition-all whitespace-nowrap flex items-center gap-1.5 hover:from-amber-500/30 hover:via-orange-500/30 hover:to-yellow-500/30 hover:border-amber-500/50 shadow-[0_0_12px_rgba(251,191,36,0.15)]'
      }
    } else if (key === filter) {
      btn.className = 'px-3 py-1.5 text-xs font-medium text-zinc-100 bg-zinc-800 border border-zinc-700 rounded flex items-center gap-1.5 whitespace-nowrap'
    } else {
      btn.className = 'px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent hover:border-zinc-700 rounded transition-colors whitespace-nowrap flex items-center gap-1.5'
    }
  })
  
  applyFilters()
}

// Initialize event listeners
function initEventListeners() {
  // Search input
  const searchInput = document.getElementById('search-input')
  if (searchInput) {
    let debounceTimer
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        searchQuery = e.target.value
        applyFilters()
      }, 300)
    })
  }
  
  // Filter buttons
  document.getElementById('filter-all')?.addEventListener('click', () => setActiveFilter('all'))
  document.getElementById('filter-active')?.addEventListener('click', () => setActiveFilter('active'))
  document.getElementById('filter-offline')?.addEventListener('click', () => setActiveFilter('offline'))
  document.getElementById('filter-top')?.addEventListener('click', () => setActiveFilter('top'))
  document.getElementById('filter-converted')?.addEventListener('click', () => setActiveFilter('converted'))
  
  // Page size selector
  const pageSizeSelect = document.getElementById('page-size-select')
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener('change', (e) => {
      pageSize = parseInt(e.target.value)
      currentPage = 1 // Reset to first page
      renderTable()
    })
  }
  
  // Export button
  setupExportLearners()
  
  // Setup modal
  setupAddLearnerModal()
}

// Export current page to Excel
function setupExportLearners() {
  const exportBtn = document.getElementById('export-learners-btn')
  if (!exportBtn) return
  
  exportBtn.addEventListener('click', () => {
    const now = new Date()
    const dateStr = now.toISOString().split('T')[0]
    
    // Get current page data
    const start = (currentPage - 1) * pageSize
    const end = start + pageSize
    const pageData = filteredLearners.slice(start, end)
    
    if (pageData.length === 0) {
      alert('No data to export')
      return
    }
    
    // Create workbook
    const wb = XLSX.utils.book_new()
    
    // Determine filter name for the report
    const filterNames = {
      'all': 'All Learners',
      'active': 'Active Learners',
      'offline': 'Offline Learners',
      'top': 'Top Active Users'
    }
    const filterName = filterNames[currentFilter] || 'Learners'
    
    // --- Sheet 1: Learners Data ---
    const learnersData = [
      [''],
      ['', 'VENDINGPRENEURS LEARNERS EXPORT'],
      ['', filterName],
      [''],
      ['', 'Generated:', now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })],
      ['', 'Time:', now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })],
      ['', 'Page:', `${currentPage} of ${Math.ceil(filteredLearners.length / pageSize)}`],
      ['', 'Showing:', `${pageData.length} of ${filteredLearners.length} total learners`],
      [''],
      [''],
      ['', '#', 'EMAIL', 'COURSES', 'ACTIVE DAYS (30D)', 'TOTAL EVENTS', 'STATUS', 'CONVERTED', 'FIRST ACTIVITY', 'LAST ACTIVITY'],
      ['']
    ]
    
    pageData.forEach((learner, index) => {
      const courses = learner.courses ? learner.courses.join(', ') : '-'
      const status = learner.status === 'active' ? 'Active' : 'Offline'
      const isConverted = convertedEmails.has(learner.email) ? 'Yes' : 'No'
      const firstActivity = learner.first_activity_at 
        ? new Date(learner.first_activity_at).toLocaleDateString() 
        : '-'
      const lastActivity = learner.last_activity_at 
        ? new Date(learner.last_activity_at).toLocaleDateString() 
        : '-'
      
      learnersData.push([
        '',
        start + index + 1,
        learner.email,
        courses,
        learner.active_days_30d || 0,
        learner.total_events || 0,
        status,
        isConverted,
        firstActivity,
        lastActivity
      ])
    })
    
    // Add summary
    learnersData.push([''])
    learnersData.push(['', '─'.repeat(80)])
    learnersData.push([''])
    learnersData.push(['', 'SUMMARY'])
    learnersData.push(['', 'Total on this page:', pageData.length])
    learnersData.push(['', 'Active learners:', pageData.filter(l => l.status === 'active').length])
    learnersData.push(['', 'Offline learners:', pageData.filter(l => l.status !== 'active').length])
    learnersData.push(['', 'Converted learners:', pageData.filter(l => convertedEmails.has(l.email)).length])
    
    const totalEvents = pageData.reduce((sum, l) => sum + (l.total_events || 0), 0)
    learnersData.push(['', 'Total events:', totalEvents.toLocaleString()])
    
    const avgEvents = pageData.length > 0 ? (totalEvents / pageData.length).toFixed(1) : 0
    learnersData.push(['', 'Avg events per learner:', avgEvents])
    
    const wsLearners = XLSX.utils.aoa_to_sheet(learnersData)
    wsLearners['!cols'] = [
      { wch: 5 },  // Margin
      { wch: 6 },  // #
      { wch: 35 }, // Email
      { wch: 40 }, // Courses
      { wch: 16 }, // Active Days
      { wch: 14 }, // Events
      { wch: 10 }, // Status
      { wch: 12 }, // Converted
      { wch: 14 }, // First Activity
      { wch: 14 }  // Last Activity
    ]
    XLSX.utils.book_append_sheet(wb, wsLearners, 'Learners')
    
    // Download the file
    const fileName = `VendingPreneurs-Learners-${filterName.replace(/\s+/g, '-')}-Page${currentPage}-${dateStr}.xlsx`
    XLSX.writeFile(wb, fileName)
  })
}

// Main load function
async function loadLearners() {
  console.log('Fetching learners data...')
  
  const tbody = document.getElementById('learners-tbody')
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="px-6 py-12 text-center text-zinc-500">
          <div class="flex flex-col items-center gap-2">
            <div class="animate-spin w-6 h-6 border-2 border-zinc-600 border-t-zinc-300 rounded-full"></div>
            <span>Loading learners...</span>
          </div>
        </td>
      </tr>
    `
  }
  
  // Fetch all learners using pagination (Supabase default limit is 1000)
  const batchSize = 1000
  let allData = []
  let from = 0
  let hasMore = true
  
  try {
    while (hasMore) {
      const { data, error } = await supabase
        .from('learners_dashboard')
        .select('*')
        .order('total_events', { ascending: false })
        .range(from, from + batchSize - 1)
      
      if (error) {
        throw error
      }
      
      if (data && data.length > 0) {
        allData = [...allData, ...data]
        from += batchSize
        hasMore = data.length === batchSize
        console.log(`Fetched ${allData.length} learners so far...`)
      } else {
        hasMore = false
      }
    }
  } catch (error) {
    console.error('Error fetching learners:', error)
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="px-6 py-12 text-center text-red-400">
            <div class="flex flex-col items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8"><circle cx="12" cy="12" r="10"></circle><path d="m15 9-6 6"></path><path d="m9 9 6 6"></path></svg>
              <span>Error loading learners: ${error.message}</span>
            </div>
          </td>
        </tr>
      `
    }
    return
  }
  
  console.log('Total learners fetched:', allData.length)
  
  allLearners = allData
  filteredLearners = [...allLearners]
  
  // Fetch converted users data
  await loadConvertedUsers()
  
  updateFilterCounts()
  renderTable()
  initEventListeners()
}

// Load converted users (users with backend products who also have frontend products)
async function loadConvertedUsers() {
  try {
    // Fetch backend revenue metrics which contains converted customer info
    const { data, error } = await supabase
      .from('backend_revenue_metrics')
      .select('top_converted_customers')
      .single()
    
    if (error) {
      console.log('Backend metrics not available yet:', error.message)
      return
    }
    
    // Extract emails from converted customers
    if (data?.top_converted_customers) {
      data.top_converted_customers.forEach(customer => {
        if (customer.email) {
          convertedEmails.add(customer.email)
        }
      })
    }
    
    console.log('Loaded', convertedEmails.size, 'converted users')
  } catch (e) {
    console.error('Error loading converted users:', e)
  }
}

// Setup Add Learner Modal
function setupAddLearnerModal() {
  const modal = document.getElementById('add-learner-modal')
  const btn = document.getElementById('add-learner-btn')
  const closeBtn = document.getElementById('close-modal-btn')
  const cancelBtn = document.getElementById('cancel-modal-btn')
  const backdrop = document.getElementById('modal-backdrop')
  const form = document.getElementById('add-learner-form')
  const spinner = document.getElementById('loading-spinner')
  const submitIcon = document.getElementById('submit-icon')
  const submitBtn = document.getElementById('submit-btn')
  const formView = document.getElementById('modal-form-view')
  const successView = document.getElementById('modal-success-view')
  const formError = document.getElementById('form-error')
  const formErrorMessage = document.getElementById('form-error-message')
  
  if (!modal || !btn || !form) return
  
  // Show form view (reset to initial state)
  const showFormView = () => {
    formView.classList.remove('hidden')
    successView.classList.add('hidden')
    formError.classList.add('hidden')
  }
  
  // Show success view
  const showSuccessView = (email, courses) => {
    formView.classList.add('hidden')
    successView.classList.remove('hidden')
    
    // Populate success details
    document.getElementById('success-email').textContent = email
    document.getElementById('success-courses').innerHTML = courses.map(course => `
      <span class="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">${course}</span>
    `).join('')
  }
  
  // Show error
  const showError = (message) => {
    formError.classList.remove('hidden')
    formErrorMessage.textContent = message
  }
  
  // Open modal
  btn.addEventListener('click', () => {
    modal.classList.remove('hidden')
    showFormView()
    document.body.style.overflow = 'hidden'
  })
  
  // Close modal functions
  const closeModal = () => {
    modal.classList.add('hidden')
    document.body.style.overflow = ''
    form.reset()
    showFormView()
  }
  
  closeBtn?.addEventListener('click', closeModal)
  cancelBtn?.addEventListener('click', closeModal)
  backdrop?.addEventListener('click', closeModal)
  
  // Success view buttons
  document.getElementById('add-another-btn')?.addEventListener('click', () => {
    form.reset()
    showFormView()
  })
  
  document.getElementById('done-btn')?.addEventListener('click', () => {
    closeModal()
    loadLearners() // Refresh the list
  })
  
  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeModal()
    }
  })
  
  // Handle form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    
    // Hide any previous errors
    formError.classList.add('hidden')
    
    const email = document.getElementById('learner-email').value
    const courseCheckboxes = document.querySelectorAll('input[name="courses"]:checked')
    const selectedCourses = Array.from(courseCheckboxes).map(cb => cb.value)
    
    if (!email) {
      showError('Please enter an email address')
      return
    }
    
    if (selectedCourses.length === 0) {
      showError('Please select at least one course')
      return
    }
    
    // Show loading state
    submitBtn.disabled = true
    spinner.classList.remove('hidden')
    submitIcon.classList.add('hidden')
    
    try {
      const now = new Date().toISOString()
      
      // Prepare rows for upsert
      const rowsToUpsert = selectedCourses.map(courseKey => ({
        email: email,
        course_key: courseKey,
        is_active: true,
        granted_at: now
      }))
      
      // Perform upsert to entitlements table
      const { error } = await supabase
        .from('entitlements')
        .upsert(rowsToUpsert, { onConflict: 'email,course_key' })
      
      if (error) throw error
      
      // Success! Show success view
      showSuccessView(email, selectedCourses)
      
    } catch (error) {
      console.error('Error adding learner:', error)
      showError(error.message || 'Failed to add learner. Please try again.')
    } finally {
      // Reset loading state
      submitBtn.disabled = false
      spinner.classList.add('hidden')
      submitIcon.classList.remove('hidden')
    }
  })
}

// Run on load
loadLearners()

