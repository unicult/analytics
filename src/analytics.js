import { createClient } from '@supabase/supabase-js'

// Initialize Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// Helper: Format currency
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
}

// Helper: Format percentage
const formatPercent = (val) => {
  if (!val) return '0%'
  return (parseFloat(val) * 100).toFixed(1) + '%'
}

// Helper: Convert URL path to readable title
const pathToTitle = (path) => {
  let cleanPath = path.replace('https://courses.vendingpreneurs.com', '')
  cleanPath = cleanPath.replace(/^\//, '').replace(/#.*$/, '')
  
  if (!cleanPath) return 'Home'
  
  const segments = cleanPath.split('/').filter(Boolean)
  const lastSegment = segments[segments.length - 1] || segments[0] || 'Page'
  
  return lastSegment
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Helper: Get icon for lesson type
const getLessonIcon = (path) => {
  if (path.includes('sign-in')) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="m10 17 5-5-5-5"></path><path d="M15 12H3"></path><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path></svg>'
  }
  if (path.includes('all-courses')) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><rect width="7" height="7" x="3" y="3" rx="1"></rect><rect width="7" height="7" x="14" y="3" rx="1"></rect><rect width="7" height="7" x="14" y="14" rx="1"></rect><rect width="7" height="7" x="3" y="14" rx="1"></rect></svg>'
  }
  if (path.includes('all-lessons')) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M3 5h.01"></path><path d="M3 12h.01"></path><path d="M3 19h.01"></path><path d="M8 5h13"></path><path d="M8 12h13"></path><path d="M8 19h13"></path></svg>'
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M12 7v14"></path><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path></svg>'
}

// Helper: Generate SVG path for line chart
const generateChartPath = (data, width, height, padding = 0) => {
  if (!data || data.length === 0) return ''
  
  const maxValue = Math.max(...data.map(d => d.value))
  const minValue = 0
  const range = maxValue - minValue || 1
  
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((d.value - minValue) / range) * (height - padding)
    return { x, y }
  })
  
  // Create smooth curve using cubic bezier
  let path = `M${points[0].x},${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const cpx = (prev.x + curr.x) / 2
    path += ` C${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`
  }
  
  return path
}

// Helper: Generate area path (line path + closing to bottom)
const generateAreaPath = (linePath, width, height) => {
  return `${linePath} L${width},${height} L0,${height} Z`
}

// Main load function
async function loadAnalytics() {
  console.log('Fetching analytics data...')

  // Fetch both metrics and monthly revenue in parallel
  const [metricsResult, revenueResult] = await Promise.all([
    supabase.from('metrics_dashboard').select('*').single(),
    supabase.from('monthly_revenue').select('*').order('month', { ascending: true })
  ])

  if (metricsResult.error) {
    console.error('Error fetching analytics data:', metricsResult.error)
    return
  }

  const data = metricsResult.data
  const monthlyRevenue = revenueResult.data || []

  console.log('Analytics data fetched:', data)
  console.log('Monthly revenue data:', monthlyRevenue)

  // --- Stats Cards ---
  try {
    // Monthly Revenue
    const monthlyRevenueEl = document.getElementById('stat-monthly-revenue')
    const monthlyGrowthEl = document.getElementById('stat-monthly-growth')
    const monthlyPrevEl = document.getElementById('stat-monthly-prev')
    
    if (monthlyRevenueEl) {
      monthlyRevenueEl.textContent = formatCurrency(data.revenue_this_month)
    }
    if (monthlyGrowthEl && data.revenue_mom_growth_pct) {
      const growthPct = parseFloat(data.revenue_mom_growth_pct) * 100
      const isPositive = growthPct >= 0
      monthlyGrowthEl.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 mr-1">
          ${isPositive 
            ? '<path d="M16 7h6v6"></path><path d="m22 7-8.5 8.5-5-5L2 17"></path>' 
            : '<path d="M16 17h6v-6"></path><path d="m22 17-8.5-8.5-5 5L2 7"></path>'}
        </svg>
        ${Math.abs(growthPct).toFixed(1)}%
      `
      monthlyGrowthEl.className = isPositive 
        ? 'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
        : 'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20'
    }
    if (monthlyPrevEl) {
      monthlyPrevEl.textContent = `vs ${formatCurrency(data.revenue_prev_month)} last month`
    }

    // Lifetime Revenue
    const lifetimeRevenueEl = document.getElementById('stat-lifetime-revenue')
    if (lifetimeRevenueEl) {
      lifetimeRevenueEl.textContent = formatCurrency(data.total_lifetime_revenue)
    }

    // Total Users
    const totalUsersEl = document.getElementById('stat-total-users')
    if (totalUsersEl) {
      totalUsersEl.textContent = data.total_lifetime_users.toLocaleString()
    }

    // Active Users (MAU)
    const mauEl = document.getElementById('stat-mau')
    const dauEl = document.getElementById('stat-dau')
    if (mauEl) {
      mauEl.textContent = data.mau_30d.toLocaleString()
    }
    if (dauEl) {
      dauEl.innerHTML = `<span class="text-zinc-300 font-medium">${data.dau_today}</span> daily active (DAU)`
    }
  } catch (e) {
    console.error('Error populating stats:', e)
  }

  // --- Most Visited Lesson Card ---
  try {
    const lessonNameEl = document.getElementById('top-lesson-name')
    const lessonDescEl = document.getElementById('top-lesson-desc')
    const lessonViewsEl = document.getElementById('top-lesson-views')
    const lessonUniqueEl = document.getElementById('top-lesson-unique')

    if (lessonNameEl && data.most_visited_lesson) {
      lessonNameEl.textContent = pathToTitle(data.most_visited_lesson)
    }
    if (lessonDescEl) {
      lessonDescEl.textContent = 'The main course directory page.'
    }
    if (lessonViewsEl) {
      lessonViewsEl.textContent = data.most_visited_lesson_page_views.toLocaleString()
    }
    if (lessonUniqueEl) {
      lessonUniqueEl.textContent = data.most_visited_lesson_unique_viewers.toLocaleString()
    }
  } catch (e) {
    console.error('Error populating top lesson:', e)
  }

  // --- Engagement (DAU/MAU) ---
  try {
    const stickinessEl = document.getElementById('stickiness-ratio')
    const stickinessBarEl = document.getElementById('stickiness-bar')
    const engageDauEl = document.getElementById('engage-dau')
    const engageMauEl = document.getElementById('engage-mau')

    const stickiness = data.mau_30d > 0 ? ((data.dau_today / data.mau_30d) * 100).toFixed(1) : 0

    if (stickinessEl) {
      stickinessEl.textContent = `${stickiness}%`
    }
    if (stickinessBarEl) {
      stickinessBarEl.style.width = `${Math.min(stickiness, 100)}%`
    }
    if (engageDauEl) {
      engageDauEl.textContent = data.dau_today
    }
    if (engageMauEl) {
      engageMauEl.textContent = data.mau_30d.toLocaleString()
    }
  } catch (e) {
    console.error('Error populating engagement:', e)
  }

  // --- Top Lessons Table ---
  try {
    const tbody = document.getElementById('lessons-tbody')
    
    if (tbody && data.top_lessons_30d) {
      // Filter out generic pages (All Courses, All Lessons, Sign In)
      const filteredLessons = data.top_lessons_30d.filter(lesson => {
        const path = lesson.page_path.toLowerCase()
        // Exclude sign-in, all-courses, and all-lessons
        if (path.includes('/sign-in')) return false
        if (path.includes('/all-courses')) return false
        if (path.includes('/all-lessons')) return false
        return true
      })
      
      // Calculate total views for percentage
      const totalViews = filteredLessons.slice(0, 10).reduce((sum, l) => sum + l.page_views, 0)
      
      tbody.innerHTML = filteredLessons.slice(0, 10).map(lesson => {
        const title = pathToTitle(lesson.page_path)
        const path = lesson.page_path.replace('https://courses.vendingpreneurs.com', '')
        const sharePercent = totalViews > 0 ? Math.round((lesson.page_views / totalViews) * 100) : 0
        const icon = getLessonIcon(lesson.page_path)

        return `
          <tr class="hover:bg-surfaceHighlight/20 transition-colors group">
            <td class="px-6 py-3.5">
              <div class="flex items-center gap-3">
                <div class="p-1.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-400">
                  ${icon}
                </div>
                <div>
                  <div class="font-medium text-zinc-200">${title}</div>
                  <div class="text-xs text-zinc-500 font-mono truncate max-w-[250px]">${path}</div>
                </div>
              </div>
            </td>
            <td class="px-6 py-3.5 text-right text-zinc-300">${lesson.unique_viewers.toLocaleString()}</td>
            <td class="px-6 py-3.5 text-right font-medium text-zinc-200">${lesson.page_views.toLocaleString()}</td>
            <td class="px-6 py-3.5 text-right">
              <div class="flex items-center justify-end gap-3">
                <span class="text-xs text-zinc-500">${sharePercent}%</span>
                <div class="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div class="h-full bg-zinc-400 rounded-full" style="width: ${sharePercent}%"></div>
                </div>
              </div>
            </td>
          </tr>
        `
      }).join('')
    }
  } catch (e) {
    console.error('Error populating lessons table:', e)
  }

  // --- All-Time Revenue Growth Chart ---
  try {
    const chartContainer = document.getElementById('revenue-chart')
    const chartLabels = document.getElementById('chart-labels')
    const chartYAxis = document.getElementById('chart-y-axis')
    
    if (chartContainer && monthlyRevenue.length > 0) {
      // Calculate cumulative revenue over all time
      let cumulative = 0
      const cumulativeData = []
      
      // Add starting point at $0 (one month before first data point)
      if (monthlyRevenue.length > 0) {
        const firstMonth = new Date(monthlyRevenue[0].month)
        firstMonth.setMonth(firstMonth.getMonth() - 1)
        cumulativeData.push({
          month: firstMonth.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          monthShort: firstMonth.toLocaleDateString('en-US', { month: 'short' }),
          value: 0
        })
      }
      
      // Add cumulative values for each month
      for (const m of monthlyRevenue) {
        cumulative += parseFloat(m.revenue) || 0
        cumulativeData.push({
          month: new Date(m.month).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          monthShort: new Date(m.month).toLocaleDateString('en-US', { month: 'short' }),
          value: cumulative
        })
      }
      
      const width = 1000
      const height = 260
      const padding = 30
      
      const maxValue = Math.max(...cumulativeData.map(d => d.value))
      const minValue = 0
      
      // Generate points
      const points = cumulativeData.map((d, i) => {
        const x = cumulativeData.length > 1 ? (i / (cumulativeData.length - 1)) * width : width / 2
        const y = height - ((d.value - minValue) / (maxValue - minValue || 1)) * (height - padding)
        return { x, y, value: d.value, month: d.month, monthShort: d.monthShort }
      })
      
      // Create smooth SVG path
      let linePath = `M${points[0].x},${points[0].y}`
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1]
        const curr = points[i]
        const cpx = (prev.x + curr.x) / 2
        linePath += ` C${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`
      }
      
      // Area path
      const areaPath = `${linePath} L${width},${height} L0,${height} Z`
      
      // Last point for tooltip
      const lastPoint = points[points.length - 1]
      const pathLength = 2000
      
      // Update SVG
      chartContainer.innerHTML = `
        <defs>
          <linearGradient id="revenueGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#10b981" stop-opacity="0.35"/>
            <stop offset="50%" stop-color="#10b981" stop-opacity="0.15"/>
            <stop offset="100%" stop-color="#10b981" stop-opacity="0"/>
          </linearGradient>
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#059669"/>
            <stop offset="50%" stop-color="#10b981"/>
            <stop offset="100%" stop-color="#34d399"/>
          </linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        <style>
          @keyframes drawLine {
            from { stroke-dashoffset: ${pathLength}; }
            to { stroke-dashoffset: 0; }
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes scaleIn {
            0% { transform: scale(0); opacity: 0; }
            60% { transform: scale(1.3); }
            100% { transform: scale(1); opacity: 1; }
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
          }
          .line-draw {
            stroke-dasharray: ${pathLength};
            stroke-dashoffset: ${pathLength};
            animation: drawLine 2s ease-out forwards;
          }
          .area-fade {
            opacity: 0;
            animation: fadeIn 1s ease-out 0.5s forwards;
          }
          .point-scale {
            transform-origin: center;
            animation: scaleIn 0.4s ease-out forwards;
          }
          .tooltip-fade {
            opacity: 0;
            animation: fadeIn 0.5s ease-out 2.2s forwards;
          }
          .pulse-dot {
            animation: pulse 2s ease-in-out infinite;
          }
        </style>
        
        <!-- Area Fill -->
        <path d="${areaPath}" fill="url(#revenueGradient)" class="area-fade"></path>
        
        <!-- Main Line with gradient -->
        <path d="${linePath}" fill="none" stroke="url(#lineGradient)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)" class="line-draw"></path>

        <!-- Data Points -->
        ${points.map((p, i) => `
          <circle cx="${p.x}" cy="${p.y}" r="${i === points.length - 1 ? 7 : 4}" fill="#09090b" stroke="#10b981" stroke-width="${i === points.length - 1 ? 3 : 2}" class="point-scale ${i === points.length - 1 ? 'pulse-dot' : ''}" style="animation-delay: ${1.5 + i * 0.08}s"/>
        `).join('')}
        
        <!-- Final Value Tooltip -->
        <g class="tooltip-fade">
          <rect x="${lastPoint.x - 130}" y="${Math.max(lastPoint.y - 55, 5)}" width="120" height="42" rx="8" fill="#18181b" stroke="#10b981" stroke-width="1.5" stroke-opacity="0.6"></rect>
          <text x="${lastPoint.x - 120}" y="${Math.max(lastPoint.y - 35, 22)}" fill="#6ee7b7" font-family="Inter" font-size="10" font-weight="400">All-Time Revenue</text>
          <text x="${lastPoint.x - 120}" y="${Math.max(lastPoint.y - 18, 40)}" fill="#ffffff" font-family="Inter" font-size="14" font-weight="600">${formatCurrency(lastPoint.value)}</text>
        </g>
      `
      
      // Update X-axis labels (show fewer labels for readability)
      if (chartLabels) {
        const labelCount = Math.min(6, cumulativeData.length)
        const step = Math.floor(cumulativeData.length / labelCount)
        const labels = []
        for (let i = 0; i < cumulativeData.length; i += step) {
          labels.push(cumulativeData[i].monthShort)
        }
        // Always include the last month
        if (labels[labels.length - 1] !== cumulativeData[cumulativeData.length - 1].monthShort) {
          labels.push(cumulativeData[cumulativeData.length - 1].monthShort)
        }
        chartLabels.innerHTML = labels.map(l => `<span>${l}</span>`).join('')
      }
      
      // Update Y-axis labels
      if (chartYAxis) {
        const step = maxValue / 4
        chartYAxis.innerHTML = [4, 3, 2, 1, 0].map(i => {
          const val = step * i
          const label = val >= 1000 ? `$${Math.round(val / 1000)}k` : `$${Math.round(val)}`
          return `<div class="border-b border-border/50 w-full h-0 flex items-center"><span class="absolute left-0 w-8 text-right pr-2">${label}</span></div>`
        }).join('')
      }
    }
  } catch (e) {
    console.error('Error rendering revenue chart:', e)
  }

  console.log('Analytics page loaded successfully!')
}

// Export Analytics to Excel
function setupExportAnalytics() {
  const exportBtn = document.getElementById('export-analytics-btn')
  if (!exportBtn) return
  
  exportBtn.addEventListener('click', async () => {
    const now = new Date()
    const dateStr = now.toISOString().split('T')[0]
    
    // Fetch fresh data
    const [metricsResult, revenueResult] = await Promise.all([
      supabase.from('metrics_dashboard').select('*').single(),
      supabase.from('monthly_revenue').select('*').order('month', { ascending: true })
    ])
    
    const data = metricsResult.data || {}
    const monthlyRevenue = revenueResult.data || []
    
    // Create workbook
    const wb = XLSX.utils.book_new()
    
    // --- Sheet 1: Summary ---
    const summaryData = [
      [''],
      ['', 'VENDINGPRENEURS ANALYTICS REPORT'],
      [''],
      ['', 'Generated:', now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })],
      ['', 'Time:', now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })],
      [''],
      [''],
      ['', 'KEY METRICS', ''],
      [''],
      ['', 'Monthly Revenue', formatCurrency(data.revenue_this_month || 0)],
      ['', 'Previous Month', formatCurrency(data.revenue_prev_month || 0)],
      ['', 'MoM Growth', data.revenue_mom_growth_pct ? `${(parseFloat(data.revenue_mom_growth_pct) * 100).toFixed(1)}%` : 'N/A'],
      [''],
      ['', 'Lifetime Revenue', formatCurrency(data.total_lifetime_revenue || 0)],
      ['', 'Total Users', (data.total_lifetime_users || 0).toLocaleString()],
      [''],
      ['', 'Monthly Active Users (MAU)', (data.mau_30d || 0).toLocaleString()],
      ['', 'Daily Active Users (DAU)', (data.dau_today || 0).toLocaleString()],
      ['', 'Stickiness (DAU/MAU)', data.mau_30d > 0 ? `${((data.dau_today / data.mau_30d) * 100).toFixed(1)}%` : 'N/A'],
    ]
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
    wsSummary['!cols'] = [{ wch: 5 }, { wch: 30 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')
    
    // --- Sheet 2: Monthly Revenue ---
    if (monthlyRevenue.length > 0) {
      const revenueData = [
        [''],
        ['', 'MONTHLY REVENUE BREAKDOWN'],
        [''],
        [''],
        ['', 'MONTH', 'REVENUE', 'CUMULATIVE'],
        ['']
      ]
      
      let cumulative = 0
      monthlyRevenue.forEach(m => {
        cumulative += parseFloat(m.revenue) || 0
        const monthDate = new Date(m.month)
        revenueData.push([
          '',
          monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
          formatCurrency(m.revenue),
          formatCurrency(cumulative)
        ])
      })
      
      revenueData.push([''])
      revenueData.push(['', '─'.repeat(50)])
      revenueData.push(['', 'TOTAL ALL-TIME', formatCurrency(cumulative)])
      
      const wsRevenue = XLSX.utils.aoa_to_sheet(revenueData)
      wsRevenue['!cols'] = [{ wch: 5 }, { wch: 25 }, { wch: 15 }, { wch: 15 }]
      XLSX.utils.book_append_sheet(wb, wsRevenue, 'Monthly Revenue')
    }
    
    // --- Sheet 3: Top Lessons ---
    if (data.top_lessons_30d && data.top_lessons_30d.length > 0) {
      const filteredLessons = data.top_lessons_30d.filter(lesson => {
        const path = lesson.page_path.toLowerCase()
        if (path.includes('/sign-in')) return false
        if (path.includes('/all-courses')) return false
        if (path.includes('/all-lessons')) return false
        return true
      })
      
      const lessonsData = [
        [''],
        ['', 'TOP VISITED LESSONS (30 Days)'],
        [''],
        [''],
        ['', 'RANK', 'LESSON', 'UNIQUE VIEWERS', 'TOTAL VIEWS'],
        ['']
      ]
      
      filteredLessons.slice(0, 15).forEach((lesson, index) => {
        lessonsData.push([
          '',
          index + 1,
          pathToTitle(lesson.page_path),
          lesson.unique_viewers,
          lesson.page_views
        ])
      })
      
      lessonsData.push([''])
      lessonsData.push(['', '─'.repeat(60)])
      lessonsData.push(['', 'TOTAL LESSONS', filteredLessons.length])
      
      const wsLessons = XLSX.utils.aoa_to_sheet(lessonsData)
      wsLessons['!cols'] = [{ wch: 5 }, { wch: 6 }, { wch: 40 }, { wch: 16 }, { wch: 12 }]
      XLSX.utils.book_append_sheet(wb, wsLessons, 'Top Lessons')
    }
    
    // Download the file
    XLSX.writeFile(wb, `VendingPreneurs-Analytics-${dateStr}.xlsx`)
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

// Run on load
loadAnalytics().then(() => {
  setupExportAnalytics()
  // Setup tooltips after a brief delay to ensure DOM is ready
  setTimeout(setupKpiTooltips, 500)
})

