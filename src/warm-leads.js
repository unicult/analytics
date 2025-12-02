import { createClient } from '@supabase/supabase-js'

// Initialize Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// State
let highActivityUsers = []
let abandonedClicks = []
let todayActiveUsers = []
let boughtInactiveUsers = []
let bookedEmails = new Set()

// Frontend course keys
const FRONTEND_KEYS = [
  'Profit Machine System',
  'Profit Machine Maximizer', 
  'Rapid Scaling Blueprint',
  'Profit Machine Maximizer (3-Pay plan)'
]

// Main load function
async function loadWarmLeads() {
  console.log('Loading warm leads data...')
  
  // Get today's date boundaries (UTC)
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const todayStr = today.toISOString()
  
  // Load all data in parallel using pre-aggregated views (FAST!)
  const [bookedResult, highActivityResult, abandonedResult, todayEventsResult, todayEntitlementsResult, backendMetricsResult] = await Promise.all([
    supabase
      .from('analytics_events')
      .select('email')
      .eq('event_name', 'call_booked'),
    supabase
      .from('warm_leads_high_activity')
      .select('*'),
    supabase
      .from('warm_leads_abandoned')
      .select('*'),
    // Today's events
    supabase
      .from('analytics_events')
      .select('email, event_name, page_url, occurred_at')
      .gte('occurred_at', todayStr)
      .not('email', 'is', null)
      .order('occurred_at', { ascending: false })
      .limit(5000),
    // Today's entitlements (purchases)
    supabase
      .from('entitlements')
      .select('email, course_key, granted_at')
      .gte('granted_at', todayStr)
      .order('granted_at', { ascending: false }),
    // Backend metrics for converted customers
    supabase
      .from('backend_revenue_metrics')
      .select('top_converted_customers')
      .single()
  ])
  
  // Process booked emails
  if (bookedResult.data) {
    bookedEmails = new Set(bookedResult.data.map(d => d.email).filter(Boolean))
  }
  console.log(`Found ${bookedEmails.size} users who have booked calls`)
  
  // Get set of converted emails (customers who already have backend products)
  const convertedEmails = new Set()
  if (backendMetricsResult.data?.top_converted_customers) {
    backendMetricsResult.data.top_converted_customers.forEach(customer => {
      if (customer.email) convertedEmails.add(customer.email)
    })
  }
  console.log(`Found ${convertedEmails.size} already converted customers`)
  
  // Process high activity users from view - EXCLUDING already converted users
  if (highActivityResult.error) {
    console.error('Error fetching high activity users:', highActivityResult.error)
  } else if (highActivityResult.data) {
    highActivityUsers = highActivityResult.data
      .filter(u => !convertedEmails.has(u.email)) // Exclude already converted users
      .map(u => ({
        email: u.email,
        viewCount: parseInt(u.view_count) || 0,
        uniqueLessonCount: parseInt(u.unique_lessons) || 0,
        totalEngagedMs: parseInt(u.total_engaged_ms) || 0,
        lastActive: u.last_active ? new Date(u.last_active) : null,
        hasBooked: bookedEmails.has(u.email)
      }))
    console.log(`Loaded ${highActivityUsers.length} ready to convert users (excluding ${convertedEmails.size} already converted)`)
  }
  
  // Process abandoned clicks from view
  if (abandonedResult.error) {
    console.error('Error fetching abandoned clicks:', abandonedResult.error)
  } else if (abandonedResult.data) {
    abandonedClicks = abandonedResult.data.map(u => {
      const lastClick = u.last_click ? new Date(u.last_click) : new Date()
      const firstClick = u.first_click ? new Date(u.first_click) : lastClick
      const daysSinceLastClick = Math.floor((new Date() - lastClick) / (1000 * 60 * 60 * 24))
      
      return {
        email: u.email,
        clickCount: parseInt(u.click_count) || 0,
        pages: u.pages || [],
        firstClickDate: firstClick,
        lastClickDate: lastClick,
        lastClickPage: u.last_click_page || '',
        daysSinceLastClick
      }
    })
    console.log(`Loaded ${abandonedClicks.length} abandoned clicks from view`)
  }
  
  // Process today's active users
  if (todayEventsResult.error) {
    console.error('Error fetching today events:', todayEventsResult.error)
  } else if (todayEventsResult.data) {
    const userActivity = {}
    todayEventsResult.data.forEach(event => {
      if (!event.email) return
      if (!userActivity[event.email]) {
        userActivity[event.email] = {
          email: event.email,
          eventCount: 0,
          pages: new Set(),
          lastActivity: null,
          lastPage: ''
        }
      }
      userActivity[event.email].eventCount++
      if (event.page_url) {
        userActivity[event.email].pages.add(event.page_url)
        if (!userActivity[event.email].lastPage) {
          userActivity[event.email].lastPage = event.page_url
        }
      }
      if (!userActivity[event.email].lastActivity) {
        userActivity[event.email].lastActivity = new Date(event.occurred_at)
      }
    })
    
    todayActiveUsers = Object.values(userActivity)
      .map(u => ({
        ...u,
        pageCount: u.pages.size
      }))
      .sort((a, b) => b.eventCount - a.eventCount)
    
    console.log(`Found ${todayActiveUsers.length} active users today`)
  }
  
  // Process bought today but not active
  if (todayEntitlementsResult.error) {
    console.error('Error fetching today entitlements:', todayEntitlementsResult.error)
  } else if (todayEntitlementsResult.data && todayEventsResult.data) {
    // Get set of emails that have events today
    const activeEmailsToday = new Set(todayEventsResult.data.map(e => e.email).filter(Boolean))
    
    // Find entitlements where user hasn't been active today
    const inactiveByEmail = {}
    todayEntitlementsResult.data.forEach(ent => {
      if (!ent.email || activeEmailsToday.has(ent.email)) return
      
      // Only keep the first (most recent) entitlement per email
      if (!inactiveByEmail[ent.email]) {
        const purchaseTime = new Date(ent.granted_at)
        const hoursSince = Math.floor((new Date() - purchaseTime) / (1000 * 60 * 60))
        
        inactiveByEmail[ent.email] = {
          email: ent.email,
          course: ent.course_key,
          purchaseTime: purchaseTime,
          hoursSince: hoursSince
        }
      }
    })
    
    boughtInactiveUsers = Object.values(inactiveByEmail)
      .sort((a, b) => b.purchaseTime - a.purchaseTime)
    
    console.log(`Found ${boughtInactiveUsers.length} users who bought today but aren't active`)
  }
  
  // Render everything
  updateKPIs()
  renderHighActivityTable(highActivityUsers)
  renderAbandonedTable(abandonedClicks)
  renderTodayActiveTable(todayActiveUsers)
  renderBoughtInactiveTable(boughtInactiveUsers)
  
  setupSearch()
  
  console.log('Warm leads page loaded!')
}

// Update KPIs
function updateKPIs() {
  const highActivityEl = document.getElementById('kpi-high-activity')
  const abandonedEl = document.getElementById('kpi-abandoned')
  const conversionEl = document.getElementById('kpi-conversion')
  
  if (highActivityEl) {
    highActivityEl.textContent = highActivityUsers.length
  }
  
  if (abandonedEl) {
    abandonedEl.textContent = abandonedClicks.length
  }
  
  if (conversionEl) {
    // Calculate conversion rate: users who clicked and booked vs total who clicked
    const totalClickers = abandonedClicks.length + bookedEmails.size
    if (totalClickers > 0) {
      const rate = (bookedEmails.size / totalClickers * 100).toFixed(1)
      conversionEl.textContent = `${rate}%`
    }
  }
}

// Render high activity table
function renderHighActivityTable(users) {
  const tbody = document.getElementById('high-activity-tbody')
  if (!tbody) return
  
  if (users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="px-6 py-20 text-center text-zinc-500">
          <div class="flex flex-col items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-zinc-800/50 border border-zinc-700 flex items-center justify-center text-zinc-500">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
            </div>
            <span>No high activity users found</span>
          </div>
        </td>
      </tr>
    `
    return
  }
  
  // Find max view count for progress bar scaling
  const maxViews = Math.max(...users.map(u => u.viewCount))
  
  tbody.innerHTML = users.map((user, index) => {
    const initials = getInitials(user.email)
    const timeStr = formatDuration(user.totalEngagedMs)
    const lastActiveStr = formatRelativeTime(user.lastActive)
    const progressWidth = Math.max(5, (user.viewCount / maxViews) * 100)
    
    // Rank styling - top 3 get special colors
    let rankClass = "bg-zinc-800 text-zinc-400"
    if (index === 0) rankClass = "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
    if (index === 1) rankClass = "bg-zinc-300/20 text-zinc-200 border-zinc-300/30"
    if (index === 2) rankClass = "bg-amber-700/20 text-amber-400 border-amber-700/30"
    
    return `
      <tr class="hover:bg-surfaceHighlight/10 transition-colors group border-b border-border/40 last:border-0">
        <td class="px-6 py-4 text-center">
          <div class="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold mx-auto border border-transparent ${rankClass}">
            ${index + 1}
          </div>
        </td>
        <td class="px-6 py-4">
          <div class="flex items-center gap-3">
            <div class="relative">
              <div class="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300 shadow-inner">
                ${initials}
              </div>
              <div class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-background rounded-full flex items-center justify-center">
                <div class="w-2.5 h-2.5 bg-emerald-500 rounded-full shadow-sm shadow-emerald-500/50"></div>
              </div>
            </div>
            <div class="flex flex-col">
              <span class="text-zinc-200 text-sm font-medium group-hover:text-white transition-colors">${user.email.split('@')[0]}</span>
              <span class="text-[11px] text-zinc-500 font-mono">${user.email}</span>
            </div>
          </div>
        </td>
        <td class="px-6 py-4">
          <div class="w-full max-w-[180px]">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-emerald-400 font-bold text-sm">${user.viewCount}</span>
              <span class="text-[10px] text-zinc-500 uppercase tracking-wider">Views</span>
            </div>
            <div class="h-1.5 w-full bg-zinc-800/50 rounded-full overflow-hidden">
              <div class="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.3)]" style="width: ${progressWidth}%"></div>
            </div>
          </div>
        </td>
        <td class="px-6 py-4 text-center">
          <div class="inline-flex items-center justify-center px-2.5 py-1 rounded-md bg-zinc-800/50 border border-zinc-700/50 text-zinc-300 text-xs font-medium">
            ${user.uniqueLessonCount}
          </div>
        </td>
        <td class="px-6 py-4 text-center">
          <div class="text-zinc-400 text-xs font-medium bg-zinc-800/30 px-2 py-1 rounded inline-block">
            ${timeStr || '—'}
          </div>
        </td>
        <td class="px-6 py-4">
          <div class="flex items-center gap-2 text-zinc-400 text-xs">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 text-zinc-600"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            ${lastActiveStr}
          </div>
        </td>
        <td class="px-6 py-4 text-center">
          ${user.hasBooked 
            ? `<div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                <div class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                BOOKED
              </div>`
            : `<div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-medium bg-zinc-800/50 text-zinc-500 border border-zinc-700/50">
                <div class="w-1.5 h-1.5 rounded-full bg-zinc-600"></div>
                No
              </div>`
          }
        </td>
      </tr>
    `
  }).join('')
}

// Render abandoned clicks table
function renderAbandonedTable(users) {
  const tbody = document.getElementById('abandoned-tbody')
  if (!tbody) return
  
  if (users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="px-6 py-20 text-center text-zinc-500">
          <div class="flex flex-col items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-zinc-800/50 border border-zinc-700 flex items-center justify-center text-zinc-500">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            </div>
            <span>No abandoned booking clicks found</span>
          </div>
        </td>
      </tr>
    `
    return
  }
  
  tbody.innerHTML = users.map(user => {
    const initials = getInitials(user.email)
    const pageName = extractPageName(user.lastClickPage)
    const firstClickStr = formatDate(user.firstClickDate)
    const lastClickStr = formatDate(user.lastClickDate)
    
    // Color code days since - more urgent = warmer color
    let daysBadgeClass = 'bg-zinc-800 text-zinc-400 border-zinc-700'
    let daysText = `${user.daysSinceLastClick} days ago`
    
    if (user.daysSinceLastClick <= 3) {
      daysBadgeClass = 'bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_10px_rgba(248,113,113,0.15)]'
      daysText = user.daysSinceLastClick === 0 ? 'Today' : user.daysSinceLastClick === 1 ? 'Yesterday' : `${user.daysSinceLastClick} days ago`
    } else if (user.daysSinceLastClick <= 7) {
      daysBadgeClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    } else if (user.daysSinceLastClick <= 14) {
      daysBadgeClass = 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
    }
    
    return `
      <tr class="hover:bg-surfaceHighlight/10 transition-colors group border-b border-border/40 last:border-0">
        <td class="px-6 py-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300 shadow-inner">
              ${initials}
            </div>
            <div class="flex flex-col">
              <span class="text-zinc-200 text-sm font-medium group-hover:text-white transition-colors">${user.email.split('@')[0]}</span>
              <span class="text-[11px] text-zinc-500 font-mono">${user.email}</span>
            </div>
          </div>
        </td>
        <td class="px-6 py-4">
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded bg-zinc-800/50 flex items-center justify-center text-zinc-400 border border-zinc-700/50">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </div>
            <span class="text-zinc-300 text-sm" title="${user.lastClickPage}">${pageName}</span>
          </div>
          ${user.pages.length > 1 ? `<div class="ml-8 mt-1 text-[10px] text-zinc-500 font-medium px-1.5 py-0.5 bg-zinc-800/30 rounded inline-block">+${user.pages.length - 1} other pages</div>` : ''}
        </td>
        <td class="px-6 py-4 text-center">
          <div class="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold text-sm">
            ${user.clickCount}
          </div>
        </td>
        <td class="px-6 py-4">
          <div class="text-zinc-500 text-xs">${firstClickStr}</div>
        </td>
        <td class="px-6 py-4">
          <div class="text-zinc-300 text-xs font-medium">${lastClickStr}</div>
        </td>
        <td class="px-6 py-4 text-center">
          <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border ${daysBadgeClass}">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            ${daysText}
          </div>
        </td>
      </tr>
    `
  }).join('')
}

// Render today's active users table
function renderTodayActiveTable(users) {
  const tbody = document.getElementById('today-active-tbody')
  if (!tbody) return
  
  if (users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="px-6 py-16 text-center text-zinc-500">
          <div class="flex flex-col items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-zinc-800/50 border border-zinc-700 flex items-center justify-center text-zinc-500">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            </div>
            <span>No active users today yet</span>
          </div>
        </td>
      </tr>
    `
    return
  }
  
  tbody.innerHTML = users.map(user => {
    const initials = getInitials(user.email)
    const timeStr = formatTimeAgo(user.lastActivity)
    const courseName = extractCourseName(user.lastPage)
    
    return `
      <tr class="hover:bg-surfaceHighlight/10 transition-colors group border-b border-border/40 last:border-0">
        <td class="px-6 py-4">
          <div class="flex items-center gap-3">
            <div class="relative">
              <div class="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300 shadow-inner">
                ${initials}
              </div>
              <div class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-background rounded-full flex items-center justify-center">
                <div class="w-2.5 h-2.5 bg-sky-500 rounded-full shadow-sm shadow-sky-500/50 animate-pulse"></div>
              </div>
            </div>
            <div class="flex flex-col">
              <span class="text-zinc-200 text-sm font-medium group-hover:text-white transition-colors">${user.email.split('@')[0]}</span>
              <span class="text-[11px] text-zinc-500 font-mono">${user.email}</span>
            </div>
          </div>
        </td>
        <td class="px-6 py-4 text-center">
          <div class="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 font-bold text-sm">
            ${user.eventCount}
          </div>
        </td>
        <td class="px-6 py-4 text-center">
          <div class="inline-flex items-center justify-center px-2.5 py-1 rounded-md bg-zinc-800/50 border border-zinc-700/50 text-zinc-300 text-xs font-medium">
            ${user.pageCount}
          </div>
        </td>
        <td class="px-6 py-4">
          <div class="flex items-center gap-2 text-zinc-400 text-xs">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 text-sky-500"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            ${timeStr}
          </div>
        </td>
        <td class="px-6 py-4">
          <span class="text-zinc-300 text-sm" title="${user.lastPage}">${courseName}</span>
        </td>
      </tr>
    `
  }).join('')
}

// Render bought today but inactive table
function renderBoughtInactiveTable(users) {
  const tbody = document.getElementById('bought-inactive-tbody')
  if (!tbody) return
  
  if (users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="px-6 py-16 text-center text-zinc-500">
          <div class="flex flex-col items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            </div>
            <span>All new customers are active! 🎉</span>
          </div>
        </td>
      </tr>
    `
    return
  }
  
  tbody.innerHTML = users.map(user => {
    const initials = getInitials(user.email)
    const purchaseTimeStr = formatTime(user.purchaseTime)
    
    // Color code hours since - more urgent = warmer color
    let hoursBadgeClass = 'bg-zinc-800 text-zinc-400 border-zinc-700'
    if (user.hoursSince >= 6) {
      hoursBadgeClass = 'bg-red-500/10 text-red-400 border-red-500/20'
    } else if (user.hoursSince >= 3) {
      hoursBadgeClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    } else if (user.hoursSince >= 1) {
      hoursBadgeClass = 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
    } else {
      hoursBadgeClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    }
    
    return `
      <tr class="hover:bg-surfaceHighlight/10 transition-colors group border-b border-border/40 last:border-0">
        <td class="px-6 py-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300 shadow-inner">
              ${initials}
            </div>
            <div class="flex flex-col">
              <span class="text-zinc-200 text-sm font-medium group-hover:text-white transition-colors">${user.email.split('@')[0]}</span>
              <span class="text-[11px] text-zinc-500 font-mono">${user.email}</span>
            </div>
          </div>
        </td>
        <td class="px-6 py-4">
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded bg-purple-500/10 flex items-center justify-center text-purple-400 border border-purple-500/20">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="M12 7v14"></path><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path></svg>
            </div>
            <span class="text-zinc-300 text-sm">${user.course}</span>
          </div>
        </td>
        <td class="px-6 py-4">
          <div class="text-zinc-400 text-sm">${purchaseTimeStr}</div>
        </td>
        <td class="px-6 py-4 text-center">
          <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border ${hoursBadgeClass}">
            ${user.hoursSince}h
          </div>
        </td>
        <td class="px-6 py-4 text-center">
          <a href="mailto:${user.email}" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg>
            Reach Out
          </a>
        </td>
      </tr>
    `
  }).join('')
}

// Setup search functionality
function setupSearch() {
  const highActivitySearch = document.getElementById('search-high-activity')
  const abandonedSearch = document.getElementById('search-abandoned')
  const todayActiveSearch = document.getElementById('search-today-active')
  const boughtInactiveSearch = document.getElementById('search-bought-inactive')
  
  if (highActivitySearch) {
    highActivitySearch.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase()
      const filtered = highActivityUsers.filter(u => 
        u.email.toLowerCase().includes(query)
      )
      renderHighActivityTable(filtered)
    })
  }
  
  if (abandonedSearch) {
    abandonedSearch.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase()
      const filtered = abandonedClicks.filter(u => 
        u.email.toLowerCase().includes(query)
      )
      renderAbandonedTable(filtered)
    })
  }
  
  if (todayActiveSearch) {
    todayActiveSearch.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase()
      const filtered = todayActiveUsers.filter(u => 
        u.email.toLowerCase().includes(query)
      )
      renderTodayActiveTable(filtered)
    })
  }
  
  if (boughtInactiveSearch) {
    boughtInactiveSearch.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase()
      const filtered = boughtInactiveUsers.filter(u => 
        u.email.toLowerCase().includes(query)
      )
      renderBoughtInactiveTable(filtered)
    })
  }
  
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

// Helper: Format duration
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

// Helper: Format relative time
function formatRelativeTime(date) {
  if (!date) return 'Never'
  const now = new Date()
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
  return `${Math.floor(diffDays / 365)} years ago`
}

// Helper: Format date
function formatDate(date) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

// Helper: Format time (for today's timestamps)
function formatTime(date) {
  if (!date) return '—'
  return new Date(date).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

// Helper: Format time ago (e.g., "5 min ago")
function formatTimeAgo(date) {
  if (!date) return 'Unknown'
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / (1000 * 60))
  
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins} min ago`
  
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  
  return formatRelativeTime(date)
}

// Helper: Extract course name from URL
function extractCourseName(url) {
  if (!url) return 'Unknown'
  try {
    const urlObj = new URL(url)
    const path = urlObj.pathname
    const parts = path.split('/').filter(Boolean)
    
    if (parts.length > 0) {
      // Usually course is the first part after domain
      const coursePart = parts[0]
      return coursePart
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
    }
  } catch {}
  return 'Course'
}

// Helper: Extract page name from URL
function extractPageName(url) {
  if (!url) return 'Unknown Page'
  try {
    const urlObj = new URL(url)
    const path = urlObj.pathname
    
    if (path === '/' || path === '') return 'Home'
    if (path.includes('all-courses')) return 'All Courses'
    if (path.includes('all-lessons')) return 'All Lessons'
    
    const parts = path.split('/').filter(Boolean)
    if (parts.length > 0) {
      const lastPart = parts[parts.length - 1]
      return lastPart
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
    }
  } catch {}
  return 'Page'
}

// Export Warm Leads to Excel
function setupExportWarmLeads() {
  const exportBtn = document.getElementById('export-warm-leads-btn')
  if (!exportBtn) return
  
  exportBtn.addEventListener('click', () => {
    const now = new Date()
    const dateStr = now.toISOString().split('T')[0]
    
    // Create workbook
    const wb = XLSX.utils.book_new()
    
    // --- Sheet 1: Executive Summary ---
    const summaryData = [
      [''],
      ['', 'VENDINGPRENEURS WARM LEADS REPORT'],
      [''],
      ['', 'Generated:', now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })],
      ['', 'Time:', now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })],
      [''],
      [''],
      ['', 'SUMMARY METRICS', ''],
      [''],
      ['', 'Ready To Convert', highActivityUsers.length],
      ['', 'Abandoned Booking Clicks', abandonedClicks.length],
      ['', 'Today\'s Active Users', todayActiveUsers.length],
      ['', 'Bought Today But Inactive', boughtInactiveUsers.length],
      [''],
      ['', 'Click Conversion Rate', `${bookedEmails.size > 0 && abandonedClicks.length > 0 ? ((bookedEmails.size / (abandonedClicks.length + bookedEmails.size)) * 100).toFixed(1) : 0}%`],
      ['', 'Users Who Booked Calls', bookedEmails.size],
    ]
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
    wsSummary['!cols'] = [{ wch: 5 }, { wch: 35 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')
    
    // --- Sheet 2: Abandoned Clicks ---
    if (abandonedClicks.length > 0) {
      const abandonedData = [
        [''],
        ['', 'ABANDONED BOOKING CLICKS'],
        ['', 'Users who clicked "Book Call" but never completed booking'],
        [''],
        [''],
        ['', '#', 'EMAIL', 'CLICK COUNT', 'LAST CLICKED PAGE', 'FIRST CLICK', 'LAST CLICK', 'DAYS SINCE'],
        ['']
      ]
      
      abandonedClicks.forEach((user, index) => {
        abandonedData.push([
          '',
          index + 1,
          user.email,
          user.clickCount,
          extractPageName(user.lastClickPage),
          formatDate(user.firstClickDate),
          formatDate(user.lastClickDate),
          user.daysSinceLastClick
        ])
      })
      
      abandonedData.push([''])
      abandonedData.push(['', '─'.repeat(70)])
      abandonedData.push(['', 'TOTAL ABANDONED USERS', abandonedClicks.length])
      abandonedData.push(['', 'TOTAL CLICK ATTEMPTS', abandonedClicks.reduce((sum, u) => sum + u.clickCount, 0)])
      
      const wsAbandoned = XLSX.utils.aoa_to_sheet(abandonedData)
      wsAbandoned['!cols'] = [{ wch: 5 }, { wch: 5 }, { wch: 35 }, { wch: 12 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 12 }]
      XLSX.utils.book_append_sheet(wb, wsAbandoned, 'Abandoned Clicks')
    }
    
    // --- Sheet 3: Ready To Convert ---
    if (highActivityUsers.length > 0) {
      const highActivityData = [
        [''],
        ['', 'READY TO CONVERT'],
        ['', 'Top engaged users who haven\'t converted to backend yet'],
        [''],
        [''],
        ['', 'RANK', 'EMAIL', 'LESSON VIEWS', 'UNIQUE LESSONS', 'TIME SPENT', 'LAST ACTIVE', 'BOOKED CALL'],
        ['']
      ]
      
      highActivityUsers.forEach((user, index) => {
        let rankLabel = `#${index + 1}`
        if (index === 0) rankLabel = '🥇 #1'
        else if (index === 1) rankLabel = '🥈 #2'
        else if (index === 2) rankLabel = '🥉 #3'
        
        highActivityData.push([
          '',
          rankLabel,
          user.email,
          user.viewCount,
          user.uniqueLessonCount,
          formatDuration(user.totalEngagedMs) || '-',
          formatRelativeTime(user.lastActive),
          user.hasBooked ? 'Yes' : 'No'
        ])
      })
      
      highActivityData.push([''])
      highActivityData.push(['', '─'.repeat(70)])
      highActivityData.push(['', 'TOTAL USERS', highActivityUsers.length])
      highActivityData.push(['', 'TOTAL LESSON VIEWS', highActivityUsers.reduce((sum, u) => sum + u.viewCount, 0).toLocaleString()])
      highActivityData.push(['', 'USERS WHO BOOKED', highActivityUsers.filter(u => u.hasBooked).length])
      
      const wsHighActivity = XLSX.utils.aoa_to_sheet(highActivityData)
      wsHighActivity['!cols'] = [{ wch: 5 }, { wch: 8 }, { wch: 35 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 14 }]
      XLSX.utils.book_append_sheet(wb, wsHighActivity, 'Ready To Convert')
    }
    
    // --- Sheet 4: Today's Active Users ---
    if (todayActiveUsers.length > 0) {
      const todayActiveData = [
        [''],
        ['', 'TODAY\'S ACTIVE USERS'],
        ['', `Users who have been active on ${now.toLocaleDateString()}`],
        [''],
        [''],
        ['', '#', 'EMAIL', 'EVENTS TODAY', 'PAGES VIEWED', 'LAST ACTIVITY', 'CURRENT COURSE'],
        ['']
      ]
      
      todayActiveUsers.forEach((user, index) => {
        todayActiveData.push([
          '',
          index + 1,
          user.email,
          user.eventCount,
          user.pageCount,
          formatTimeAgo(user.lastActivity),
          extractCourseName(user.lastPage)
        ])
      })
      
      todayActiveData.push([''])
      todayActiveData.push(['', '─'.repeat(70)])
      todayActiveData.push(['', 'TOTAL ACTIVE TODAY', todayActiveUsers.length])
      todayActiveData.push(['', 'TOTAL EVENTS TODAY', todayActiveUsers.reduce((sum, u) => sum + u.eventCount, 0)])
      
      const wsTodayActive = XLSX.utils.aoa_to_sheet(todayActiveData)
      wsTodayActive['!cols'] = [{ wch: 5 }, { wch: 5 }, { wch: 35 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 25 }]
      XLSX.utils.book_append_sheet(wb, wsTodayActive, 'Today Active')
    }
    
    // --- Sheet 5: Bought Today But Inactive ---
    if (boughtInactiveUsers.length > 0) {
      const boughtInactiveData = [
        [''],
        ['', 'BOUGHT TODAY BUT NOT YET ACTIVE'],
        ['', 'New customers who purchased today but haven\'t started learning'],
        [''],
        [''],
        ['', '#', 'EMAIL', 'COURSE PURCHASED', 'PURCHASE TIME', 'HOURS SINCE'],
        ['']
      ]
      
      boughtInactiveUsers.forEach((user, index) => {
        boughtInactiveData.push([
          '',
          index + 1,
          user.email,
          user.course,
          formatTime(user.purchaseTime),
          user.hoursSince
        ])
      })
      
      boughtInactiveData.push([''])
      boughtInactiveData.push(['', '─'.repeat(70)])
      boughtInactiveData.push(['', 'TOTAL INACTIVE NEW CUSTOMERS', boughtInactiveUsers.length])
      boughtInactiveData.push([''])
      boughtInactiveData.push(['', 'ACTION REQUIRED: Reach out to these customers to help them get started!'])
      
      const wsBoughtInactive = XLSX.utils.aoa_to_sheet(boughtInactiveData)
      wsBoughtInactive['!cols'] = [{ wch: 5 }, { wch: 5 }, { wch: 35 }, { wch: 30 }, { wch: 14 }, { wch: 12 }]
      XLSX.utils.book_append_sheet(wb, wsBoughtInactive, 'Bought Not Active')
    }
    
    // Download the file
    XLSX.writeFile(wb, `VendingPreneurs-Warm-Leads-${dateStr}.xlsx`)
  })
}

// Setup KPI tooltips using a portal approach to avoid z-index issues
function setupKpiTooltips() {
  const createPortalTooltip = (container, tooltipTemplate, getPosition) => {
    // Disable original tooltip
    tooltipTemplate.style.display = 'none'

    container.addEventListener('mouseenter', () => {
      // Create or get global tooltip container
      let portal = document.getElementById('kpi-tooltip-portal')
      if (!portal) {
        portal = document.createElement('div')
        portal.id = 'kpi-tooltip-portal'
        portal.style.position = 'fixed'
        portal.style.zIndex = '999999'
        portal.style.pointerEvents = 'none'
        document.body.appendChild(portal)
      }
      
      // Clone content
      portal.innerHTML = tooltipTemplate.innerHTML
      
      // Apply base styles
      portal.style.backgroundColor = '#18181b'
      portal.style.border = '1px solid #3f3f46'
      portal.style.boxShadow = '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)'
      portal.style.borderRadius = '0.5rem'
      portal.style.padding = '0.75rem'
      portal.style.width = tooltipTemplate.classList.contains('w-64') ? '16rem' : '14rem'
      portal.style.visibility = 'visible'
      portal.style.opacity = '1'
      
      // Position tooltip below the icon, aligned to the icon's left position
      const rect = container.getBoundingClientRect()
      portal.style.left = `${rect.left}px`
      portal.style.top = `${rect.bottom + 8}px`
      portal.style.transform = 'none'
    })
    
    container.addEventListener('mouseleave', () => {
      const portal = document.getElementById('kpi-tooltip-portal')
      if (portal) {
        portal.style.visibility = 'hidden'
        portal.style.opacity = '0'
      }
    })
  }

  // Regular tooltips
  document.querySelectorAll('.group\\/tooltip').forEach(container => {
    const tooltip = container.querySelector('.fixed')
    if (!tooltip) return
    
    createPortalTooltip(container, tooltip, (rect, cardRect) => ({
      left: cardRect.left + 20,
      top: rect.bottom + 8
    }))
  })
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  loadWarmLeads()
  setupExportWarmLeads()
  // Setup tooltips after a brief delay to ensure DOM is ready
  setTimeout(setupKpiTooltips, 500)
})
