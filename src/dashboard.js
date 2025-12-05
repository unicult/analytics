import { createClient } from '@supabase/supabase-js'

// 1. Initialize Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// 2. Helper to format money
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
}

// Helper to format percentage
const formatPercent = (val) => {
    if (!val) return '0%'
    return (parseFloat(val) * 100).toFixed(1) + '%'
}

// Helper to convert URL path to readable title
const pathToTitle = (path) => {
  // Remove domain if present
  let cleanPath = path.replace('https://courses.vendingpreneurs.com', '')
  
  // Remove leading slash and hash fragments
  cleanPath = cleanPath.replace(/^\//, '').replace(/#.*$/, '')
  
  if (!cleanPath) return 'Home'
  
  // Split by slashes, take the most meaningful part (usually last segment)
  const segments = cleanPath.split('/').filter(Boolean)
  const lastSegment = segments[segments.length - 1] || segments[0] || 'Page'
  
  // Convert kebab-case to Title Case
  return lastSegment
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Frontend course keys (for identifying backend products)
const FRONTEND_KEYS = [
  'Profit Machine System',
  'Profit Machine Maximizer', 
  'Rapid Scaling Blueprint',
  'Profit Machine Maximizer (3-Pay plan)'
]

// 3. Main Data Function
async function loadDashboard() {
  console.log("Fetching dashboard data...")

  // Fetch dashboard metrics and backend revenue in parallel
  const [metricsResult, backendResult] = await Promise.all([
    supabase.from('metrics_dashboard').select('*').single(),
    supabase.from('backend_revenue_metrics').select('*').single()
  ])

  if (metricsResult.error) {
    console.error('Error fetching data:', metricsResult.error)
    return
  }

  const data = metricsResult.data
  const backendData = backendResult.data || {}
  
  console.log('Data fetched successfully:', data)
  console.log('Backend data:', backendData)

  // --- 1. Populate KPIs ---
  try {
    // Revenue
    if (document.getElementById('kpi-revenue')) 
      document.getElementById('kpi-revenue').innerText = formatCurrency(data.total_lifetime_revenue)
    
    // Revenue MoM Growth
    if (document.getElementById('kpi-revenue-pct') && data.revenue_mom_growth_pct !== undefined) {
      const growthPct = parseFloat(data.revenue_mom_growth_pct) * 100
      const isPositive = growthPct >= 0
      const formattedPct = Math.abs(growthPct).toFixed(1) + '%'
      
      document.getElementById('kpi-revenue-pct').innerText = formattedPct
      
      // Update styling based on positive/negative growth
      const changeEl = document.getElementById('kpi-revenue-change')
      if (changeEl) {
        if (isPositive) {
          changeEl.className = 'text-emerald-500 flex items-center gap-0.5 font-medium bg-emerald-500/10 px-1.5 py-0.5 rounded'
          changeEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path d="M16 7h6v6"></path><path d="m22 7-8.5 8.5-5-5L2 17"></path></svg> <span id="kpi-revenue-pct">${formattedPct}</span>`
        } else {
          changeEl.className = 'text-red-500 flex items-center gap-0.5 font-medium bg-red-500/10 px-1.5 py-0.5 rounded'
          changeEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path d="M16 17h6v-6"></path><path d="m22 17-8.5-8.5-5 5L2 7"></path></svg> <span id="kpi-revenue-pct">${formattedPct}</span>`
        }
      }
    }
    
    // Active Users
    if (document.getElementById('kpi-active-users'))
      document.getElementById('kpi-active-users').innerText = data.mau_30d.toLocaleString()
    
    if (document.getElementById('kpi-active-today'))
      document.getElementById('kpi-active-today').innerText = `${data.dau_today} active today`
    
    // Booked Calls
    if (document.getElementById('kpi-booked-calls'))
      document.getElementById('kpi-booked-calls').innerText = data.call_booked_users_30d
    
    if (document.getElementById('kpi-booked-context'))
      document.getElementById('kpi-booked-context').innerText = `${data.book_call_click_users_30d} clicks on booking page`
    
    // Booking Rate
    const ratePct = formatPercent(data.book_call_click_rate_30d)
    if (document.getElementById('kpi-booking-rate'))
      document.getElementById('kpi-booking-rate').innerText = ratePct

    if (document.getElementById('kpi-booking-conversion'))
      document.getElementById('kpi-booking-conversion').innerText = formatPercent(data.book_to_booked_conversion_30d)
    
    // Backend Revenue KPI
    if (document.getElementById('kpi-backend-revenue')) {
      document.getElementById('kpi-backend-revenue').innerText = formatCurrency(backendData.total_backend_revenue || 0)
    }
    if (document.getElementById('kpi-backend-sales')) {
      const customers = backendData.converted_customers_count || 0
      const sales = backendData.total_backend_sales || 0
      // Show customers count, with purchases in parentheses if different
      if (sales > customers) {
        document.getElementById('kpi-backend-sales').innerText = `${customers} customers (${sales} purchases)`
      } else {
        document.getElementById('kpi-backend-sales').innerText = `${customers} customers`
      }
    }
    if (document.getElementById('kpi-conversion-rate')) {
      const conversionRate = backendData.frontend_customers_count > 0 
        ? ((backendData.converted_customers_count / backendData.frontend_customers_count) * 100).toFixed(1)
        : 0
      document.getElementById('kpi-conversion-rate').innerText = `${conversionRate}% conversion`
    }
  } catch (e) {
    console.error('Error populating KPIs:', e)
  }


  // --- 2. Populate Products Table ---
  try {
    const productsTable = document.getElementById('table-products')
    
    if (data.revenue_by_product && productsTable) {
      // Filter out $0 revenue products and sort by revenue descending
      const filteredProducts = data.revenue_by_product
        .filter(product => product.total_revenue > 0)
        .sort((a, b) => b.total_revenue - a.total_revenue)
      
      productsTable.innerHTML = filteredProducts.map(product => {
        const widthPct = data.total_lifetime_revenue > 0 
          ? Math.min(Math.round((product.total_revenue / data.total_lifetime_revenue) * 100), 100)
          : 0
        
        const displayWidth = widthPct < 1 && product.total_revenue > 0 ? 1 : widthPct

        return `
        <tr class="group hover:bg-surfaceHighlight/20 transition-colors">
            <td class="px-5 py-3.5">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                        <iconify-icon icon="solar:box-bold-duotone" width="16"></iconify-icon>
                    </div>
                    <span class="font-medium text-zinc-200">${product.course_key}</span>
                </div>
            </td>
            <td class="px-5 py-3.5 text-right text-zinc-400">${product.total_users}</td>
            <td class="px-5 py-3.5 text-right font-medium text-zinc-200">${formatCurrency(product.total_revenue)}</td>
            <td class="px-5 py-3.5 text-right">
               <div class="flex items-center justify-end gap-2">
                  <span class="text-xs text-zinc-500">${displayWidth}%</span>
                  <div class="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div class="h-full ${product.total_revenue > 0 ? 'bg-indigo-500' : 'bg-zinc-600'}" style="width: ${displayWidth}%"></div>
                  </div>
              </div>
            </td>
        </tr>
      `}).join('')
    }
  } catch (e) {
    console.error('Error populating Products Table:', e)
  }

  // --- 3. Populate Top Content List ---
  try {
    const contentList = document.getElementById('list-content')
    
    if (data.top_lessons_30d && contentList) {
      contentList.innerHTML = data.top_lessons_30d.slice(0, 5).map((lesson, index) => `
        <div class="flex items-center justify-between p-3 rounded-lg hover:bg-surfaceHighlight/30 group transition-colors cursor-pointer">
            <div class="flex items-center gap-3 overflow-hidden">
                <div class="w-8 h-8 rounded flex-shrink-0 bg-zinc-800 border border-border flex items-center justify-center text-zinc-400 group-hover:text-zinc-200 transition-colors">
                    <span class="text-xs font-bold">${index + 1}</span>
                </div>
                <div class="flex flex-col min-w-0">
                    <span class="text-sm text-zinc-200 font-medium truncate">${pathToTitle(lesson.page_path)}</span>
                    <span class="text-xs text-zinc-500 truncate">${lesson.page_path.replace('https://courses.vendingpreneurs.com', '')}</span>
                </div>
            </div>
            <div class="text-right flex-shrink-0">
                <div class="text-sm font-medium text-zinc-200">${(lesson.page_views / 1000).toFixed(1)}k</div>
                <div class="text-xs text-zinc-500">Views</div>
            </div>
        </div>
      `).join('')
    }
  } catch (e) {
    console.error('Error populating Content List:', e)
  }

  // --- 4. Populate Top Users Table ---
  try {
    const usersTable = document.getElementById('table-users')
    console.log('Users table element:', usersTable)
    console.log('Top users data:', data.top_users_30d)
    console.log('Top users count:', data.top_users_30d ? data.top_users_30d.length : 0)

    if (usersTable && data.top_users_30d && data.top_users_30d.length > 0) {
      const usersHtml = data.top_users_30d.slice(0, 5).map(user => {
        const initials = user.email ? user.email.substring(0, 2).toUpperCase() : 'NA'
        const displayEmail = user.email || user.user_key || 'Unknown User'
        
        return `
        <tr class="hover:bg-surfaceHighlight/20 transition-colors">
            <td class="px-5 py-3">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-medium text-zinc-300">
                        ${initials}
                    </div>
                    <div class="flex flex-col">
                        <span class="text-zinc-200 text-xs font-medium">${displayEmail}</span>
                        <span class="text-[10px] text-zinc-500">Events: ${user.event_count}</span>
                    </div>
                </div>
            </td>
            <td class="px-5 py-3 text-right text-zinc-400 text-xs">${user.active_days} days</td>
            <td class="px-5 py-3 text-right text-zinc-200 font-medium text-xs">${user.event_count}</td>
            <td class="px-5 py-3 text-right">
                <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>
            </td>
        </tr>
      `}).join('')
      
      console.log('Generated users HTML length:', usersHtml.length)
      usersTable.innerHTML = usersHtml
      console.log('Users table innerHTML set successfully')
    } else {
      console.warn('Skipping users table population:', {
        hasElement: !!usersTable,
        hasData: !!data.top_users_30d,
        dataLength: data.top_users_30d ? data.top_users_30d.length : 0
      })
    }
  } catch (e) {
    console.error('Error populating Users Table:', e)
  }

  // --- 5. Populate Booking Funnel ---
  try {
    // Viewers
    if (document.getElementById('funnel-viewers'))
      document.getElementById('funnel-viewers').innerText = data.viewers_30d.toLocaleString()

    // Clicks
    if (document.getElementById('funnel-clicks'))
      document.getElementById('funnel-clicks').innerText = data.book_call_click_users_30d.toLocaleString()
    
    const clickRate = formatPercent(data.book_call_click_rate_30d)
    if (document.getElementById('funnel-clicks-rate'))
      document.getElementById('funnel-clicks-rate').innerText = `${clickRate} conversion from view`
    
    if (document.getElementById('funnel-clicks-bar'))
      document.getElementById('funnel-clicks-bar').style.width = clickRate

    // Booked
    if (document.getElementById('funnel-booked'))
      document.getElementById('funnel-booked').innerText = data.call_booked_users_30d.toLocaleString()
    
    const bookedRate = formatPercent(data.book_to_booked_conversion_30d)
    if (document.getElementById('funnel-booked-rate'))
      document.getElementById('funnel-booked-rate').innerText = `${bookedRate} conversion from click`
    
    if (document.getElementById('funnel-booked-bar'))
      document.getElementById('funnel-booked-bar').style.width = bookedRate
  } catch (e) {
    console.error('Error populating Funnel:', e)
  }

  // Setup export functionality
  setupExportReport(data, backendData)
  
  console.log('Dashboard loaded successfully!')
}

// Export Report to Excel with multiple sheets - Professional Design
function setupExportReport(data, backendData) {
  const exportBtn = document.getElementById('export-report-btn')
  if (!exportBtn || !data) return
  
  exportBtn.addEventListener('click', () => {
    const now = new Date()
    const dateStr = now.toISOString().split('T')[0]
    const reportPeriod = 'Last 30 Days'
    
    // Backend metrics
    const totalBackendRevenue = parseFloat(backendData?.total_backend_revenue || 0)
    const backendSales = backendData?.total_backend_sales || 0
    const convertedCount = backendData?.converted_customers_count || 0
    const frontendCount = backendData?.frontend_customers_count || 0
    const conversionRate = frontendCount > 0 ? ((convertedCount / frontendCount) * 100).toFixed(1) : 0
    
    // Create workbook
    const wb = XLSX.utils.book_new()
    
    // --- Sheet 1: Executive Summary ---
    const summaryData = [
      [''],
      ['', 'VENDINGPRENEURS'],
      ['', 'Executive Dashboard Report'],
      [''],
      ['', 'Report Generated:', now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })],
      ['', 'Time:', now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })],
      ['', 'Period:', reportPeriod],
      [''],
      [''],
      ['', 'FINANCIAL HIGHLIGHTS', ''],
      [''],
      ['', 'Frontend Revenue (Lifetime)', formatCurrency(data.total_lifetime_revenue)],
      ['', 'Backend Revenue (High-Ticket)', formatCurrency(totalBackendRevenue)],
      ['', 'COMBINED TOTAL REVENUE', formatCurrency(data.total_lifetime_revenue + totalBackendRevenue)],
      ['', 'Month-over-Month Growth', `${(parseFloat(data.revenue_mom_growth_pct || 0) * 100).toFixed(1)}%`],
      [''],
      [''],
      ['', 'BACKEND CONVERSION', ''],
      [''],
      ['', 'Backend Sales', backendSales.toLocaleString()],
      ['', 'Converted Customers', convertedCount.toLocaleString()],
      ['', 'Conversion Rate', `${conversionRate}%`],
      [''],
      [''],
      ['', 'USER ENGAGEMENT', ''],
      [''],
      ['', 'Monthly Active Users', data.mau_30d?.toLocaleString() || '0'],
      ['', 'Daily Active Users (Today)', data.dau_today?.toLocaleString() || '0'],
      [''],
      [''],
      ['', 'SALES PERFORMANCE', ''],
      [''],
      ['', 'Booking Page Views', data.viewers_30d?.toLocaleString() || '0'],
      ['', 'Book Call Clicks', data.book_call_click_users_30d?.toLocaleString() || '0'],
      ['', 'Calls Successfully Booked', data.call_booked_users_30d?.toLocaleString() || '0'],
      ['', 'Click-Through Rate', `${(parseFloat(data.book_call_click_rate_30d || 0) * 100).toFixed(1)}%`],
      ['', 'Booking Conversion Rate', `${(parseFloat(data.book_to_booked_conversion_30d || 0) * 100).toFixed(1)}%`],
    ]
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
    wsSummary['!cols'] = [{ wch: 5 }, { wch: 28 }, { wch: 25 }]
    wsSummary['!rows'] = [{ hpt: 20 }, { hpt: 30 }, { hpt: 22 }]
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Executive Summary')
    
    // --- Sheet 2: Booking Funnel ---
    const funnelData = [
      [''],
      ['', 'BOOKING FUNNEL ANALYSIS'],
      ['', reportPeriod],
      [''],
      [''],
      ['', 'FUNNEL STAGE', 'COUNT', 'CONVERSION', 'DROP-OFF'],
      [''],
      ['', 'Stage 1: Page Viewers', data.viewers_30d, '100%', '-'],
      ['', 'Stage 2: Clicked Book Call', data.book_call_click_users_30d, `${(parseFloat(data.book_call_click_rate_30d || 0) * 100).toFixed(1)}%`, `${(100 - parseFloat(data.book_call_click_rate_30d || 0) * 100).toFixed(1)}%`],
      ['', 'Stage 3: Call Booked', data.call_booked_users_30d, `${(parseFloat(data.book_to_booked_conversion_30d || 0) * 100).toFixed(1)}%`, `${(100 - parseFloat(data.book_to_booked_conversion_30d || 0) * 100).toFixed(1)}%`],
      [''],
      [''],
      ['', 'FUNNEL INSIGHTS'],
      [''],
      ['', `• ${data.viewers_30d?.toLocaleString() || 0} users viewed booking-related pages`],
      ['', `• ${data.book_call_click_users_30d?.toLocaleString() || 0} users showed intent by clicking the book call button`],
      ['', `• ${data.call_booked_users_30d?.toLocaleString() || 0} users completed the booking process`],
      ['', `• Overall funnel conversion: ${data.viewers_30d > 0 ? ((data.call_booked_users_30d / data.viewers_30d) * 100).toFixed(2) : 0}%`],
    ]
    const wsFunnel = XLSX.utils.aoa_to_sheet(funnelData)
    wsFunnel['!cols'] = [{ wch: 5 }, { wch: 32 }, { wch: 12 }, { wch: 14 }, { wch: 12 }]
    XLSX.utils.book_append_sheet(wb, wsFunnel, 'Booking Funnel')
    
    // --- Sheet 3: Revenue by Product ---
    if (data.revenue_by_product && data.revenue_by_product.length > 0) {
      const sortedProducts = [...data.revenue_by_product]
        .filter(p => p.total_revenue > 0)
        .sort((a, b) => b.total_revenue - a.total_revenue)
      
      const totalUsers = sortedProducts.reduce((sum, p) => sum + (p.total_users || 0), 0)
      
      const productData = [
        [''],
        ['', 'REVENUE BY PRODUCT'],
        ['', 'All Time Performance'],
        [''],
        [''],
        ['', 'PRODUCT NAME', 'CUSTOMERS', 'REVENUE', 'MARKET SHARE', 'AVG. VALUE'],
        ['']
      ]
      
      sortedProducts.forEach((product, index) => {
        const share = data.total_lifetime_revenue > 0 
          ? ((product.total_revenue / data.total_lifetime_revenue) * 100).toFixed(1)
          : 0
        const avgValue = product.total_users > 0 
          ? (product.total_revenue / product.total_users).toFixed(2)
          : 0
        productData.push([
          '',
          product.course_key,
          product.total_users,
          product.total_revenue,
          `${share}%`,
          `$${avgValue}`
        ])
      })
      
      // Add spacing and totals
      productData.push([''])
      productData.push(['', '─'.repeat(60)])
      productData.push(['', 'TOTAL', totalUsers, data.total_lifetime_revenue, '100%', ''])
      productData.push([''])
      productData.push([''])
      productData.push(['', 'TOP PERFORMER'])
      productData.push(['', `${sortedProducts[0]?.course_key} leads with ${((sortedProducts[0]?.total_revenue / data.total_lifetime_revenue) * 100).toFixed(1)}% of total revenue`])
      
      const wsProducts = XLSX.utils.aoa_to_sheet(productData)
      wsProducts['!cols'] = [{ wch: 5 }, { wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }]
      XLSX.utils.book_append_sheet(wb, wsProducts, 'Revenue by Product')
    }
    
    // --- Sheet 4: Top Pages ---
    if (data.top_lessons_30d && data.top_lessons_30d.length > 0) {
      const totalViews = data.top_lessons_30d.reduce((sum, p) => sum + (p.page_views || 0), 0)
      
      const pagesData = [
        [''],
        ['', 'TOP VISITED PAGES'],
        ['', reportPeriod],
        [''],
        [''],
        ['', '#', 'PAGE TITLE', 'URL PATH', 'VIEWS', 'UNIQUE USERS', '% OF TOTAL'],
        ['']
      ]
      
      data.top_lessons_30d.slice(0, 20).forEach((lesson, index) => {
        const pctOfTotal = totalViews > 0 ? ((lesson.page_views / totalViews) * 100).toFixed(1) : 0
        pagesData.push([
          '',
          index + 1,
          pathToTitle(lesson.page_path),
          lesson.page_path.replace('https://courses.vendingpreneurs.com', ''),
          lesson.page_views,
          lesson.unique_users || '-',
          `${pctOfTotal}%`
        ])
      })
      
      pagesData.push([''])
      pagesData.push(['', '─'.repeat(80)])
      pagesData.push(['', '', 'TOTAL', '', totalViews.toLocaleString(), '', '100%'])
      
      const wsPages = XLSX.utils.aoa_to_sheet(pagesData)
      wsPages['!cols'] = [{ wch: 5 }, { wch: 4 }, { wch: 35 }, { wch: 45 }, { wch: 10 }, { wch: 14 }, { wch: 12 }]
      XLSX.utils.book_append_sheet(wb, wsPages, 'Top Pages')
    }
    
    // --- Sheet 5: Top Users ---
    if (data.top_users_30d && data.top_users_30d.length > 0) {
      const usersData = [
        [''],
        ['', 'TOP ACTIVE USERS'],
        ['', reportPeriod],
        [''],
        [''],
        ['', 'RANK', 'EMAIL ADDRESS', 'DAYS ACTIVE', 'TOTAL EVENTS', 'AVG EVENTS/DAY'],
        ['']
      ]
      
      data.top_users_30d.slice(0, 20).forEach((user, index) => {
        const avgEventsPerDay = user.active_days > 0 
          ? (user.event_count / user.active_days).toFixed(1)
          : user.event_count
        
        let rankLabel = `#${index + 1}`
        if (index === 0) rankLabel = '🥇 #1'
        else if (index === 1) rankLabel = '🥈 #2'
        else if (index === 2) rankLabel = '🥉 #3'
        
        usersData.push([
          '',
          rankLabel,
          user.email || user.user_key || 'Unknown',
          user.active_days,
          user.event_count,
          avgEventsPerDay
        ])
      })
      
      usersData.push([''])
      usersData.push([''])
      usersData.push(['', 'USER ENGAGEMENT INSIGHTS'])
      usersData.push(['', `• Top user has ${data.top_users_30d[0]?.event_count?.toLocaleString() || 0} events across ${data.top_users_30d[0]?.active_days || 0} days`])
      usersData.push(['', `• Average events per active day for top user: ${data.top_users_30d[0]?.active_days > 0 ? (data.top_users_30d[0]?.event_count / data.top_users_30d[0]?.active_days).toFixed(1) : 0}`])
      
      const wsUsers = XLSX.utils.aoa_to_sheet(usersData)
      wsUsers['!cols'] = [{ wch: 5 }, { wch: 8 }, { wch: 35 }, { wch: 14 }, { wch: 14 }, { wch: 16 }]
      XLSX.utils.book_append_sheet(wb, wsUsers, 'Top Users')
    }
    
    // Download the file
    XLSX.writeFile(wb, `VendingPreneurs-Report-${dateStr}.xlsx`)
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

// Run it!
loadDashboard()
// Setup tooltips after a brief delay to ensure DOM is ready
setTimeout(setupKpiTooltips, 500)
