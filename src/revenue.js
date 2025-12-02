import { createClient } from '@supabase/supabase-js'

// Initialize Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// Helper: Format currency
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
}

// Helper: Format currency with decimals
const formatCurrencyDecimal = (amount) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount)
}

// Course colors for consistency
const courseColors = {
  'Profit Machine Maximizer': { bg: 'bg-indigo-500', text: 'text-indigo-400', hex: '#6366f1' },
  'Profit Machine Maximizer (3-Pay plan)': { bg: 'bg-indigo-500/50', text: 'text-indigo-400', hex: '#6366f1' },
  'Profit Machine System': { bg: 'bg-purple-500', text: 'text-purple-400', hex: '#a855f7' },
  'Rapid Scaling Blueprint': { bg: 'bg-emerald-500', text: 'text-emerald-400', hex: '#10b981' },
  'Acquisition Ace': { bg: 'bg-orange-500', text: 'text-orange-400', hex: '#f97316' },
}

const getColorForCourse = (courseName, index) => {
  if (courseColors[courseName]) return courseColors[courseName]
  const fallbackColors = [
    { bg: 'bg-cyan-500', text: 'text-cyan-400', hex: '#06b6d4' },
    { bg: 'bg-pink-500', text: 'text-pink-400', hex: '#ec4899' },
    { bg: 'bg-yellow-500', text: 'text-yellow-400', hex: '#eab308' },
  ]
  return fallbackColors[index % fallbackColors.length]
}

// Pagination state for transactions
let allTransactions = []
let transactionsPage = 0
const transactionsPerPage = 5
let metricsData = null

// Store backend data globally
let backendData = null

// Main load function
async function loadRevenue() {
  console.log('Fetching revenue data...')

  // Fetch all data in parallel (including backend metrics)
  const [metricsResult, monthlyResult, transactionsResult, backendResult] = await Promise.all([
    supabase.from('metrics_dashboard').select('*').single(),
    supabase.from('course_monthly_revenue').select('*').order('month', { ascending: true }),
    supabase.from('entitlements').select('email, course_key, granted_at, price').order('granted_at', { ascending: false }).limit(100),
    supabase.from('backend_revenue_metrics').select('*').single()
  ])

  if (metricsResult.error) {
    console.error('Error fetching metrics:', metricsResult.error)
    return
  }

  const data = metricsResult.data
  metricsData = data
  const monthlyData = monthlyResult.data || []
  allTransactions = transactionsResult.data || []
  backendData = backendResult.data || {}

  console.log('Revenue data fetched:', { data, monthlyData, allTransactions })
  console.log('Backend data fetched:', backendData)

  // --- Section 1: KPI Cards ---
  populateKPIs(data)

  // --- Backend Revenue Section ---
  populateBackendSection(backendData, data)

  // --- Section 2: Bar Chart ---
  populateChart(data, monthlyData)

  // --- Section 3: Revenue by Course Table ---
  populateCourseTable(data)

  // --- Section 4: Insights ---
  populateInsights(data, monthlyData)

  // --- Section 5: Recent Transactions ---
  transactionsPage = 0
  renderTransactionsPage()
  setupTransactionsPagination()

  console.log('Revenue page loaded successfully!')
}

// Populate Backend Revenue Section
function populateBackendSection(backend, metrics) {
  if (!backend) return
  
  const totalBackendRevenue = parseFloat(backend.total_backend_revenue) || 0
  const totalBackendSales = backend.total_backend_sales || 0
  const convertedCount = backend.converted_customers_count || 0
  const frontendCount = backend.frontend_customers_count || 0
  const conversionRate = frontendCount > 0 ? ((convertedCount / frontendCount) * 100).toFixed(1) : 0
  const avgBackendOrder = totalBackendSales > 0 ? totalBackendRevenue / totalBackendSales : 0
  const totalRevenue = (metrics?.total_lifetime_revenue || 0) + totalBackendRevenue
  const revenueShare = totalRevenue > 0 ? ((totalBackendRevenue / totalRevenue) * 100).toFixed(1) : 0
  
  // Update KPIs
  const totalRevenueEl = document.getElementById('backend-total-revenue')
  if (totalRevenueEl) totalRevenueEl.textContent = formatCurrency(totalBackendRevenue)
  
  const salesCountEl = document.getElementById('backend-sales-count')
  if (salesCountEl) salesCountEl.textContent = `${totalBackendSales} sales`
  
  // Unique customers who bought backend products
  const uniqueCustomersCount = backend.total_backend_customers || 0
  const customersEl = document.getElementById('backend-customers-count')
  if (customersEl) customersEl.textContent = uniqueCustomersCount.toLocaleString()
  
  const avgOrderEl = document.getElementById('backend-avg-order')
  if (avgOrderEl) avgOrderEl.textContent = formatCurrency(avgBackendOrder)
  
  const shareEl = document.getElementById('backend-revenue-share')
  if (shareEl) shareEl.textContent = `${revenueShare}%`
  
  const badgeEl = document.getElementById('backend-conversion-badge')
  if (badgeEl) {
    badgeEl.innerHTML = `<span class="text-xs text-amber-400 font-medium">${conversionRate}% Conversion Rate</span>`
  }
  
  // Populate backend products table
  const tbody = document.getElementById('backend-products-tbody')
  if (tbody && backend.backend_products) {
    const products = backend.backend_products || []
    
    if (products.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-6 text-center text-zinc-500">No backend products found</td></tr>`
      return
    }
    
    tbody.innerHTML = products.map(product => {
      const revenue = parseFloat(product.total_revenue) || 0
      const sales = product.total_sales || 0
      const avgPrice = parseFloat(product.avg_price) || 0
      
      return `
        <tr class="hover:bg-surface/60 transition-colors">
          <td class="px-4 py-3">
            <div class="flex items-center gap-2">
              <div class="w-2 h-2 rounded-full bg-amber-500"></div>
              <span class="text-zinc-200 font-medium">${product.course_key}</span>
            </div>
          </td>
          <td class="px-4 py-3 text-right text-amber-400 font-semibold">${formatCurrency(revenue)}</td>
          <td class="px-4 py-3 text-right text-zinc-400">${sales}</td>
          <td class="px-4 py-3 text-right text-zinc-400">${formatCurrency(avgPrice)}</td>
        </tr>
      `
    }).join('')
  }
}

// Populate KPI cards
function populateKPIs(data) {
  // Total Revenue
  const totalRevenueEl = document.getElementById('kpi-total-revenue')
  if (totalRevenueEl) {
    totalRevenueEl.textContent = formatCurrency(data.total_lifetime_revenue)
  }

  // This Month
  const thisMonthEl = document.getElementById('kpi-this-month')
  const thisMonthGrowthEl = document.getElementById('kpi-this-month-growth')
  const thisMonthPrevEl = document.getElementById('kpi-this-month-prev')
  
  if (thisMonthEl) {
    thisMonthEl.textContent = formatCurrency(data.revenue_this_month || 0)
  }
  if (thisMonthGrowthEl && data.revenue_mom_growth_pct) {
    const growthPct = parseFloat(data.revenue_mom_growth_pct) * 100
    const isPositive = growthPct >= 0
    thisMonthGrowthEl.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3">
        ${isPositive 
          ? '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline><polyline points="16 7 22 7 22 13"></polyline>'
          : '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"></polyline><polyline points="16 17 22 17 22 11"></polyline>'}
      </svg>
      ${Math.abs(growthPct).toFixed(1)}%
    `
    thisMonthGrowthEl.className = isPositive 
      ? 'text-xs bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded flex items-center gap-1'
      : 'text-xs bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded flex items-center gap-1'
  }
  if (thisMonthPrevEl) {
    thisMonthPrevEl.textContent = `vs. last month (${formatCurrency(data.revenue_prev_month || 0)})`
  }

  // AOV (Average Order Value)
  const aovEl = document.getElementById('kpi-aov')
  const aovSubEl = document.getElementById('kpi-aov-sub')
  if (aovEl && data.total_lifetime_users > 0) {
    const aov = data.total_lifetime_revenue / data.total_lifetime_users
    aovEl.textContent = formatCurrencyDecimal(aov)
  }

  // Revenue per Active User
  const arpuEl = document.getElementById('kpi-arpu')
  const arpuSubEl = document.getElementById('kpi-arpu-sub')
  if (arpuEl && data.mau_30d > 0) {
    const arpu = data.total_lifetime_revenue / data.mau_30d
    arpuEl.textContent = formatCurrencyDecimal(arpu)
  }
  if (arpuSubEl) {
    arpuSubEl.textContent = `Across ${data.mau_30d?.toLocaleString() || 0} active users`
  }
}

// Populate stacked area chart with 3 product lines + hover tooltip
function populateChart(data, monthlyData) {
  const chartContainer = document.getElementById('chart-container')
  
  if (!chartContainer || !monthlyData.length) return

  // Group monthly data by course
  const courseData = {}
  const months = [...new Set(monthlyData.map(d => d.month))].sort()
  const recentMonths = months.slice(-6)

  monthlyData.forEach(row => {
    if (!courseData[row.course_key]) {
      courseData[row.course_key] = {}
    }
    courseData[row.course_key][row.month] = parseFloat(row.revenue) || 0
  })

  // Get top 3 courses by total revenue
  const courseRevenue = data.revenue_by_product || []
  const topCourses = courseRevenue
    .filter(c => c.total_revenue > 0)
    .sort((a, b) => b.total_revenue - a.total_revenue)
    .slice(0, 3)

  if (topCourses.length === 0) return

  // Define colors for each course
  const colors = [
    { stroke: '#6366f1', fill: 'rgba(99, 102, 241, 0.15)', name: 'indigo' },
    { stroke: '#a855f7', fill: 'rgba(168, 85, 247, 0.15)', name: 'purple' },
    { stroke: '#10b981', fill: 'rgba(16, 185, 129, 0.15)', name: 'emerald' }
  ]

  // Chart dimensions
  const width = 1000
  const height = 260
  const paddingX = 0
  const paddingY = 20

  // Calculate max value across all courses for scaling
  let maxValue = 0
  recentMonths.forEach(month => {
    topCourses.forEach(course => {
      const val = courseData[course.course_key]?.[month] || 0
      if (val > maxValue) maxValue = val
    })
  })
  maxValue = maxValue * 1.2 || 1

  // Generate points for each course
  const coursePoints = topCourses.map((course, courseIndex) => {
    const points = recentMonths.map((month, i) => {
      const x = paddingX + (i / Math.max(recentMonths.length - 1, 1)) * (width - paddingX * 2)
      const value = courseData[course.course_key]?.[month] || 0
      const y = paddingY + (1 - value / maxValue) * (height - paddingY * 2)
      return { x, y, value, month }
    })
    return { course: course.course_key, points, color: colors[courseIndex] }
  })

  // Create paths for each course
  const paths = coursePoints.map(({ points, color }) => {
    let linePath = `M${points[0].x},${points[0].y}`
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]
      const curr = points[i]
      const cpx = (prev.x + curr.x) / 2
      linePath += ` C${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`
    }
    const areaPath = `${linePath} L${points[points.length - 1].x},${height} L${points[0].x},${height} Z`
    return { linePath, areaPath, color }
  })

  // Y-axis labels
  const yLabels = [0, 1, 2, 3, 4].map(i => {
    const val = (maxValue / 4) * (4 - i)
    return val >= 1000 ? '$' + (val / 1000).toFixed(0) + 'k' : '$' + Math.round(val)
  })

  // Store data for hover
  window.chartData = { coursePoints, recentMonths, width, paddingX }

  // Build HTML
  chartContainer.innerHTML = `
    <div class="relative w-full h-full">
      <!-- Y-axis labels -->
      <div class="absolute left-0 top-0 bottom-8 w-10 flex flex-col justify-between text-right pr-2">
        ${yLabels.map(l => `<span class="text-[10px] text-zinc-600">${l}</span>`).join('')}
      </div>
      
      <!-- Chart area -->
      <div class="absolute left-10 right-0 top-0 bottom-8 overflow-hidden">
        <svg id="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" class="w-full h-full">
          <defs>
            ${paths.map((p, i) => `
              <linearGradient id="grad${i}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="${p.color.stroke}" stop-opacity="0.3"/>
                <stop offset="100%" stop-color="${p.color.stroke}" stop-opacity="0"/>
              </linearGradient>
            `).join('')}
          </defs>
          
          <!-- Grid lines -->
          ${[0, 1, 2, 3, 4].map(i => {
            const y = paddingY + (i / 4) * (height - paddingY * 2)
            return `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#27272a" stroke-width="1" />`
          }).join('')}
          
          <!-- Areas (bottom to top for layering) -->
          ${paths.slice().reverse().map((p, i) => `
            <path d="${p.areaPath}" fill="url(#grad${paths.length - 1 - i})" />
          `).join('')}
          
          <!-- Lines -->
          ${paths.map(p => `
            <path d="${p.linePath}" fill="none" stroke="${p.color.stroke}" stroke-width="2" stroke-linecap="round" />
          `).join('')}
          
          <!-- Hover line (hidden by default) -->
          <line id="hover-line" x1="0" y1="${paddingY}" x2="0" y2="${height}" stroke="rgba(255,255,255,0.2)" stroke-width="1" stroke-dasharray="4 4" style="display: none;" />
          
          <!-- Hover dots -->
          ${topCourses.map((_, i) => `
            <circle id="hover-dot-${i}" r="5" fill="#18181b" stroke="${colors[i].stroke}" stroke-width="2" style="display: none;" />
          `).join('')}
          
          <!-- Invisible hover zones -->
          <rect id="hover-zone" x="0" y="0" width="${width}" height="${height}" fill="transparent" />
        </svg>
        
        <!-- Tooltip -->
        <div id="chart-tooltip" class="absolute pointer-events-none bg-zinc-900/95 border border-zinc-700 rounded-lg p-3 shadow-xl text-xs hidden" style="min-width: 160px;">
          <div id="tooltip-month" class="text-zinc-400 font-medium mb-2"></div>
          <div id="tooltip-content" class="space-y-1.5"></div>
          <div class="border-t border-zinc-800 mt-2 pt-2 flex justify-between">
            <span class="text-zinc-400">Total</span>
            <span id="tooltip-total" class="font-semibold text-white"></span>
          </div>
        </div>
      </div>
      
      <!-- X-axis labels -->
      <div class="absolute left-10 right-0 bottom-0 h-8 flex justify-between items-start pt-2">
        ${recentMonths.map(m => {
          const date = new Date(m)
          return `<span class="text-[10px] text-zinc-600">${date.toLocaleDateString('en-US', { month: 'short' })}</span>`
        }).join('')}
      </div>
      
      <!-- Legend -->
      <div class="absolute top-0 right-0 flex items-center gap-4 text-xs">
        ${topCourses.map((course, i) => {
          const shortName = course.course_key.replace('Profit Machine ', 'PM ').replace(' (3-Pay plan)', ' 3-Pay').replace('Rapid Scaling ', '')
          return `
            <div class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full" style="background: ${colors[i].stroke}"></span>
              <span class="text-zinc-400">${shortName}</span>
            </div>
          `
        }).join('')}
      </div>
    </div>
  `

  // Setup hover interactions
  setupChartHover(topCourses, colors)
}

// Setup hover interactions for the chart
function setupChartHover(topCourses, colors) {
  const hoverZone = document.getElementById('hover-zone')
  const hoverLine = document.getElementById('hover-line')
  const tooltip = document.getElementById('chart-tooltip')
  const tooltipMonth = document.getElementById('tooltip-month')
  const tooltipContent = document.getElementById('tooltip-content')
  const tooltipTotal = document.getElementById('tooltip-total')
  
  if (!hoverZone || !window.chartData) return

  const { coursePoints, recentMonths, width, paddingX } = window.chartData

  hoverZone.addEventListener('mousemove', (e) => {
    const rect = hoverZone.getBoundingClientRect()
    const svgRect = document.getElementById('chart-svg').getBoundingClientRect()
    const mouseX = (e.clientX - svgRect.left) / svgRect.width * width
    
    // Find closest month index
    const monthWidth = (width - paddingX * 2) / Math.max(recentMonths.length - 1, 1)
    let monthIndex = Math.round((mouseX - paddingX) / monthWidth)
    monthIndex = Math.max(0, Math.min(recentMonths.length - 1, monthIndex))
    
    const month = recentMonths[monthIndex]
    const x = paddingX + (monthIndex / Math.max(recentMonths.length - 1, 1)) * (width - paddingX * 2)
    
    // Update hover line
    hoverLine.setAttribute('x1', x)
    hoverLine.setAttribute('x2', x)
    hoverLine.style.display = 'block'
    
    // Update dots and gather values
    let total = 0
    const values = []
    coursePoints.forEach((cp, i) => {
      const point = cp.points[monthIndex]
      const dot = document.getElementById(`hover-dot-${i}`)
      if (dot && point) {
        dot.setAttribute('cx', point.x)
        dot.setAttribute('cy', point.y)
        dot.style.display = 'block'
        values.push({ name: cp.course, value: point.value, color: colors[i].stroke })
        total += point.value
      }
    })
    
    // Update tooltip
    const date = new Date(month)
    tooltipMonth.textContent = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    tooltipContent.innerHTML = values.map(v => {
      const shortName = v.name.replace('Profit Machine ', 'PM ').replace(' (3-Pay plan)', ' 3-Pay').replace('Rapid Scaling ', '')
      return `
        <div class="flex justify-between items-center gap-4">
          <span class="flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full" style="background: ${v.color}"></span>
            <span class="text-zinc-300">${shortName}</span>
          </span>
          <span class="font-medium text-zinc-100">${formatCurrency(v.value)}</span>
        </div>
      `
    }).join('')
    tooltipTotal.textContent = formatCurrency(total)
    
    // Position tooltip
    const tooltipX = (x / width) * svgRect.width
    const tooltipLeft = tooltipX > svgRect.width / 2 ? tooltipX - 180 : tooltipX + 20
    tooltip.style.left = `${tooltipLeft}px`
    tooltip.style.top = '20px'
    tooltip.classList.remove('hidden')
  })

  hoverZone.addEventListener('mouseleave', () => {
    hoverLine.style.display = 'none'
    tooltip.classList.add('hidden')
    coursePoints.forEach((_, i) => {
      const dot = document.getElementById(`hover-dot-${i}`)
      if (dot) dot.style.display = 'none'
    })
  })
}

// Populate course breakdown table
function populateCourseTable(data) {
  const tbody = document.getElementById('course-table-body')
  if (!tbody || !data.revenue_by_product) return

  const courses = data.revenue_by_product
    .filter(c => c.total_revenue > 0)
    .sort((a, b) => b.total_revenue - a.total_revenue)

  const totalRevenue = courses.reduce((sum, c) => sum + c.total_revenue, 0)

  tbody.innerHTML = courses.map((course, index) => {
    const color = getColorForCourse(course.course_key, index)
    const percentage = totalRevenue > 0 ? Math.round((course.total_revenue / totalRevenue) * 100) : 0
    const revPerUser = course.total_users > 0 ? course.total_revenue / course.total_users : 0

    return `
      <tr class="hover:bg-surfaceHighlight/20 transition-colors group">
        <td class="px-5 py-3 text-zinc-300 font-medium">${course.course_key}</td>
        <td class="px-5 py-3">
          <div class="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div class="h-full ${color.bg}" style="width: ${percentage}%"></div>
          </div>
          <div class="text-[10px] text-zinc-500 mt-1">${percentage}% of total</div>
        </td>
        <td class="px-5 py-3 text-right text-zinc-200">${formatCurrency(course.total_revenue)}</td>
        <td class="px-5 py-3 text-right text-zinc-400">${course.total_users.toLocaleString()}</td>
        <td class="px-5 py-3 text-right text-zinc-400 hidden sm:table-cell">${formatCurrency(revPerUser)}</td>
      </tr>
    `
  }).join('')
}

// Populate insights
function populateInsights(data, monthlyData) {
  // Best Month
  const bestMonthNameEl = document.getElementById('insight-best-month-name')
  const bestMonthValueEl = document.getElementById('insight-best-month-value')
  
  if (monthlyData.length > 0) {
    // Aggregate by month
    const monthlyTotals = {}
    monthlyData.forEach(row => {
      const monthKey = row.month
      monthlyTotals[monthKey] = (monthlyTotals[monthKey] || 0) + (parseFloat(row.revenue) || 0)
    })
    
    const bestMonth = Object.entries(monthlyTotals).sort((a, b) => b[1] - a[1])[0]
    if (bestMonth && bestMonthNameEl && bestMonthValueEl) {
      const date = new Date(bestMonth[0])
      bestMonthNameEl.textContent = date.toLocaleDateString('en-US', { month: 'long' })
      bestMonthValueEl.textContent = formatCurrency(bestMonth[1])
    }
  }

  // MoM Growth
  const momGrowthEl = document.getElementById('insight-mom-growth')
  if (momGrowthEl && data.revenue_mom_growth_pct) {
    const growthPct = parseFloat(data.revenue_mom_growth_pct) * 100
    momGrowthEl.textContent = `${growthPct >= 0 ? '+' : ''}${growthPct.toFixed(1)}%`
  }

  // Top Performer
  const topCourseNameEl = document.getElementById('insight-top-course-name')
  const topCourseStatsEl = document.getElementById('insight-top-course-stats')
  
  if (data.revenue_by_product && data.revenue_by_product.length > 0) {
    const topCourse = data.revenue_by_product
      .filter(c => c.total_revenue > 0)
      .sort((a, b) => b.total_revenue - a.total_revenue)[0]
    
    if (topCourse) {
      const totalRevenue = data.revenue_by_product.reduce((sum, c) => sum + c.total_revenue, 0)
      const share = totalRevenue > 0 ? Math.round((topCourse.total_revenue / totalRevenue) * 100) : 0
      
      if (topCourseNameEl) {
        topCourseNameEl.textContent = topCourse.course_key
      }
      if (topCourseStatsEl) {
        topCourseStatsEl.innerHTML = `
          <span class="text-indigo-400">${formatCurrency(topCourse.total_revenue)} revenue</span>
          <span class="w-1 h-1 bg-zinc-700 rounded-full"></span>
          <span class="text-zinc-500">${share}% share</span>
        `
      }
    }
  }
}

// Render current page of transactions
function renderTransactionsPage() {
  const tbody = document.getElementById('transactions-tbody')
  if (!tbody) return

  const start = transactionsPage * transactionsPerPage
  const end = start + transactionsPerPage
  const pageTransactions = allTransactions.slice(start, end)

  if (!pageTransactions || pageTransactions.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="px-5 py-8 text-center text-zinc-500 text-xs">
          No transactions found.
        </td>
      </tr>
    `
    return
  }

  // Get course prices for display
  const coursePrices = {}
  if (metricsData?.revenue_by_product) {
    metricsData.revenue_by_product.forEach(c => {
      if (c.total_users > 0) {
        coursePrices[c.course_key] = c.total_revenue / c.total_users
      }
    })
  }

  const avatarColors = ['indigo', 'purple', 'emerald', 'orange', 'blue', 'pink', 'cyan']

  tbody.innerHTML = pageTransactions.map((tx, index) => {
    const email = tx.email || 'Unknown'
    const initial = email.charAt(0).toUpperCase()
    const name = email.split('@')[0].replace(/[._]/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    const color = avatarColors[(start + index) % avatarColors.length]
    const price = coursePrices[tx.course_key] || 0
    const date = new Date(tx.granted_at)
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

    return `
      <tr class="hover:bg-surfaceHighlight/20 transition-colors">
        <td class="px-5 py-3 text-center">
          <div class="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px]">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 text-zinc-500"><rect width="20" height="14" x="2" y="5" rx="2"></rect><line x1="2" x2="22" y1="10" y2="10"></line></svg>
          </div>
        </td>
        <td class="px-5 py-3">
          <div class="flex items-center gap-2">
            <div class="w-5 h-5 rounded-full bg-${color}-500/20 text-${color}-300 flex items-center justify-center text-[9px] font-bold">${initial}</div>
            <div>
              <div class="font-medium text-zinc-200">${name}</div>
              <div class="text-[10px] text-zinc-500">${email}</div>
            </div>
          </div>
        </td>
        <td class="px-5 py-3 text-zinc-300">${tx.course_key}</td>
        <td class="px-5 py-3 text-zinc-500">${dateStr}</td>
        <td class="px-5 py-3 text-right font-medium text-zinc-200">${formatCurrencyDecimal(price)}</td>
        <td class="px-5 py-3 text-right">
          <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Succeeded</span>
        </td>
      </tr>
    `
  }).join('')

  // Update pagination button states
  updatePaginationButtons()
}

// Update pagination button states
function updatePaginationButtons() {
  const prevBtn = document.getElementById('transactions-prev')
  const nextBtn = document.getElementById('transactions-next')
  const totalPages = Math.ceil(allTransactions.length / transactionsPerPage)
  
  if (prevBtn) {
    if (transactionsPage === 0) {
      prevBtn.classList.add('opacity-50', 'cursor-not-allowed')
      prevBtn.classList.remove('hover:bg-surfaceHighlight')
    } else {
      prevBtn.classList.remove('opacity-50', 'cursor-not-allowed')
      prevBtn.classList.add('hover:bg-surfaceHighlight')
    }
  }
  
  if (nextBtn) {
    if (transactionsPage >= totalPages - 1) {
      nextBtn.classList.add('opacity-50', 'cursor-not-allowed')
      nextBtn.classList.remove('hover:bg-surfaceHighlight')
    } else {
      nextBtn.classList.remove('opacity-50', 'cursor-not-allowed')
      nextBtn.classList.add('hover:bg-surfaceHighlight')
    }
  }
}

// Setup pagination event listeners
function setupTransactionsPagination() {
  const prevBtn = document.getElementById('transactions-prev')
  const nextBtn = document.getElementById('transactions-next')
  const totalPages = Math.ceil(allTransactions.length / transactionsPerPage)

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (transactionsPage > 0) {
        transactionsPage--
        renderTransactionsPage()
      }
    })
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (transactionsPage < totalPages - 1) {
        transactionsPage++
        renderTransactionsPage()
      }
    })
  }
}

// Export Revenue to Excel
function setupExportRevenue() {
  const exportBtn = document.getElementById('export-revenue-btn')
  if (!exportBtn) return
  
  exportBtn.addEventListener('click', async () => {
    const now = new Date()
    const dateStr = now.toISOString().split('T')[0]
    
    // Fetch fresh data (including backend metrics)
    const [metricsResult, monthlyResult, transactionsResult, backendResult] = await Promise.all([
      supabase.from('metrics_dashboard').select('*').single(),
      supabase.from('course_monthly_revenue').select('*').order('month', { ascending: true }),
      supabase.from('entitlements').select('email, course_key, granted_at, price').order('granted_at', { ascending: false }).limit(100),
      supabase.from('backend_revenue_metrics').select('*').single()
    ])
    
    const data = metricsResult.data || {}
    const monthlyData = monthlyResult.data || []
    const transactions = transactionsResult.data || []
    const backend = backendResult.data || {}
    
    // Backend metrics
    const totalBackendRevenue = parseFloat(backend.total_backend_revenue || 0)
    const backendSales = backend.total_backend_sales || 0
    const convertedCount = backend.converted_customers_count || 0
    const frontendCount = backend.frontend_customers_count || 0
    const conversionRate = frontendCount > 0 ? ((convertedCount / frontendCount) * 100).toFixed(1) : 0
    const totalCombinedRevenue = (data.total_lifetime_revenue || 0) + totalBackendRevenue
    
    // Create workbook
    const wb = XLSX.utils.book_new()
    
    // --- Sheet 1: Summary ---
    const summaryData = [
      [''],
      ['', 'VENDINGPRENEURS REVENUE REPORT'],
      [''],
      ['', 'Generated:', now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })],
      ['', 'Time:', now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })],
      [''],
      [''],
      ['', 'REVENUE OVERVIEW', ''],
      [''],
      ['', 'Frontend Revenue', formatCurrency(data.total_lifetime_revenue || 0)],
      ['', 'Backend Revenue (High-Ticket)', formatCurrency(totalBackendRevenue)],
      ['', 'COMBINED TOTAL REVENUE', formatCurrency(totalCombinedRevenue)],
      [''],
      ['', 'This Month (Frontend)', formatCurrency(data.revenue_this_month || 0)],
      ['', 'Previous Month', formatCurrency(data.revenue_prev_month || 0)],
      ['', 'MoM Growth', data.revenue_mom_growth_pct ? `${(parseFloat(data.revenue_mom_growth_pct) * 100).toFixed(1)}%` : 'N/A'],
      [''],
      [''],
      ['', 'BACKEND CONVERSION', ''],
      [''],
      ['', 'Backend Sales', backendSales.toLocaleString()],
      ['', 'Converted Customers', convertedCount.toLocaleString()],
      ['', 'Frontend Customers', frontendCount.toLocaleString()],
      ['', 'Conversion Rate', `${conversionRate}%`],
      [''],
      ['', 'Total Customers', (data.total_lifetime_users || 0).toLocaleString()],
      ['', 'Average Order Value', data.total_lifetime_users > 0 ? formatCurrencyDecimal(data.total_lifetime_revenue / data.total_lifetime_users) : 'N/A'],
      ['', 'Revenue per Active User', data.mau_30d > 0 ? formatCurrencyDecimal(data.total_lifetime_revenue / data.mau_30d) : 'N/A'],
    ]
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
    wsSummary['!cols'] = [{ wch: 5 }, { wch: 30 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')
    
    // --- Sheet 2: Revenue by Product ---
    if (data.revenue_by_product && data.revenue_by_product.length > 0) {
      const courses = data.revenue_by_product
        .filter(c => c.total_revenue > 0)
        .sort((a, b) => b.total_revenue - a.total_revenue)
      
      const totalRevenue = courses.reduce((sum, c) => sum + c.total_revenue, 0)
      
      const productData = [
        [''],
        ['', 'REVENUE BY PRODUCT'],
        [''],
        [''],
        ['', 'PRODUCT', 'REVENUE', 'CUSTOMERS', 'REV/CUSTOMER', 'SHARE'],
        ['']
      ]
      
      courses.forEach(course => {
        const percentage = totalRevenue > 0 ? Math.round((course.total_revenue / totalRevenue) * 100) : 0
        const revPerUser = course.total_users > 0 ? course.total_revenue / course.total_users : 0
        productData.push([
          '',
          course.course_key,
          formatCurrency(course.total_revenue),
          course.total_users,
          formatCurrencyDecimal(revPerUser),
          `${percentage}%`
        ])
      })
      
      productData.push([''])
      productData.push(['', '─'.repeat(70)])
      productData.push(['', 'TOTAL', formatCurrency(totalRevenue), courses.reduce((sum, c) => sum + c.total_users, 0), '', '100%'])
      
      const wsProduct = XLSX.utils.aoa_to_sheet(productData)
      wsProduct['!cols'] = [{ wch: 5 }, { wch: 35 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 8 }]
      XLSX.utils.book_append_sheet(wb, wsProduct, 'Revenue by Product')
    }
    
    // --- Sheet 3: Monthly Breakdown ---
    if (monthlyData.length > 0) {
      // Group by month
      const monthlyTotals = {}
      monthlyData.forEach(row => {
        if (!monthlyTotals[row.month]) {
          monthlyTotals[row.month] = { total: 0, courses: {} }
        }
        monthlyTotals[row.month].total += parseFloat(row.revenue) || 0
        monthlyTotals[row.month].courses[row.course_key] = parseFloat(row.revenue) || 0
      })
      
      const months = Object.keys(monthlyTotals).sort()
      const courseNames = [...new Set(monthlyData.map(d => d.course_key))]
      
      const monthlyBreakdown = [
        [''],
        ['', 'MONTHLY REVENUE BREAKDOWN'],
        [''],
        [''],
        ['', 'MONTH', 'TOTAL', ...courseNames.map(c => c.replace('Profit Machine ', 'PM '))],
        ['']
      ]
      
      months.forEach(month => {
        const monthDate = new Date(month)
        const row = [
          '',
          monthDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          formatCurrency(monthlyTotals[month].total),
          ...courseNames.map(c => formatCurrency(monthlyTotals[month].courses[c] || 0))
        ]
        monthlyBreakdown.push(row)
      })
      
      const wsMonthly = XLSX.utils.aoa_to_sheet(monthlyBreakdown)
      wsMonthly['!cols'] = [{ wch: 5 }, { wch: 12 }, { wch: 12 }, ...courseNames.map(() => ({ wch: 14 }))]
      XLSX.utils.book_append_sheet(wb, wsMonthly, 'Monthly Breakdown')
    }
    
    // --- Sheet 4: Recent Transactions ---
    if (transactions.length > 0) {
      const coursePrices = {}
      if (data.revenue_by_product) {
        data.revenue_by_product.forEach(c => {
          if (c.total_users > 0) {
            coursePrices[c.course_key] = c.total_revenue / c.total_users
          }
        })
      }
      
      const txData = [
        [''],
        ['', 'RECENT TRANSACTIONS'],
        [''],
        [''],
        ['', '#', 'EMAIL', 'PRODUCT', 'DATE', 'AMOUNT'],
        ['']
      ]
      
      transactions.slice(0, 50).forEach((tx, index) => {
        const date = new Date(tx.granted_at)
        txData.push([
          '',
          index + 1,
          tx.email,
          tx.course_key,
          date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          formatCurrencyDecimal(coursePrices[tx.course_key] || 0)
        ])
      })
      
      const wsTx = XLSX.utils.aoa_to_sheet(txData)
      wsTx['!cols'] = [{ wch: 5 }, { wch: 5 }, { wch: 35 }, { wch: 30 }, { wch: 14 }, { wch: 12 }]
      XLSX.utils.book_append_sheet(wb, wsTx, 'Recent Transactions')
    }
    
    // Download the file
    XLSX.writeFile(wb, `VendingPreneurs-Revenue-${dateStr}.xlsx`)
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
  
  // Conversion rate tooltip
  document.querySelectorAll('.group\\/conv').forEach(container => {
    const tooltip = container.querySelector('.fixed')
    if (!tooltip) return
    
    createPortalTooltip(container, tooltip, (rect, cardRect) => ({
      left: cardRect.left + 20,
      top: rect.top - 8,
      transform: 'translateY(-100%)'
    }))
  })
}

// Run on load
loadRevenue().then(() => {
  setupExportRevenue()
  // Setup tooltips after a brief delay to ensure DOM is ready
  setTimeout(setupKpiTooltips, 500)
})

