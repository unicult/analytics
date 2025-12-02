import { createClient } from '@supabase/supabase-js'

// Initialize Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// Helper: Format currency
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
}

// Course colors for visual distinction
const courseColors = [
  { gradient: 'from-indigo-900/30', icon: 'text-indigo-400', line: '#6366f1' },
  { gradient: 'from-purple-900/30', icon: 'text-purple-400', line: '#a855f7' },
  { gradient: 'from-emerald-900/30', icon: 'text-emerald-400', line: '#10b981' },
  { gradient: 'from-orange-900/30', icon: 'text-orange-400', line: '#f97316' },
  { gradient: 'from-pink-900/30', icon: 'text-pink-400', line: '#ec4899' },
  { gradient: 'from-cyan-900/30', icon: 'text-cyan-400', line: '#06b6d4' },
]

// Course icons
const courseIcons = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path><path d="M9 12H4s.55-3.03 2-4c1.62-1.1 5-1 5-1"></path><path d="M12 15v5s3.03-.55 4-2c1.1-1.62 1-5 1-5"></path></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"></path><path d="M15 5.764v15"></path><path d="M9 3.236v15"></path></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>',
]

let allCourses = []
let selectedCourseIndex = 0
let courseMonthlyData = {}

// Main load function
async function loadCourses() {
  console.log('Fetching courses data...')

  // Fetch metrics dashboard and monthly revenue in parallel
  const [metricsResult, monthlyResult] = await Promise.all([
    supabase.from('metrics_dashboard').select('*').single(),
    supabase.from('course_monthly_revenue').select('*').order('month', { ascending: true })
  ])

  if (metricsResult.error) {
    console.error('Error fetching courses data:', metricsResult.error)
    return
  }

  const data = metricsResult.data
  
  // Process monthly revenue data by course
  if (monthlyResult.data) {
    monthlyResult.data.forEach(row => {
      if (!courseMonthlyData[row.course_key]) {
        courseMonthlyData[row.course_key] = []
      }
      courseMonthlyData[row.course_key].push({
        month: row.month,
        revenue: parseFloat(row.revenue) || 0,
        users: row.new_users
      })
    })
  }
  console.log('Monthly revenue data:', courseMonthlyData)

  console.log('Courses data fetched:', data)

  // Get revenue by product (courses)
  if (data.revenue_by_product) {
    // Filter out courses with 0 revenue and sort by revenue
    allCourses = data.revenue_by_product
      .filter(c => c.total_revenue > 0)
      .sort((a, b) => b.total_revenue - a.total_revenue)
      .map((course, index) => ({
        ...course,
        color: courseColors[index % courseColors.length],
        icon: courseIcons[index % courseIcons.length]
      }))

    console.log('Processed courses:', allCourses)

    // Render course cards
    renderCourseCards()
    
    // Update count
    const countEl = document.getElementById('courses-count')
    if (countEl) {
      countEl.textContent = `${allCourses.length} Active Products`
    }

    // Select first course by default
    if (allCourses.length > 0) {
      selectCourse(0)
    }
  }
}

// Render course cards
function renderCourseCards() {
  const container = document.getElementById('courses-grid')
  if (!container) return

  container.innerHTML = allCourses.map((course, index) => `
    <button onclick="window.selectCourse(${index})" id="card-${index}" class="course-card ${index === 0 ? 'active' : 'opacity-75 hover:opacity-100'} group relative bg-surface/40 border border-border/50 rounded-xl overflow-hidden hover:bg-surface/60 text-left transition-all duration-200">
      <div class="h-32 bg-zinc-800/50 w-full relative overflow-hidden">
        <div class="absolute inset-0 bg-gradient-to-br ${course.color.gradient} to-zinc-900"></div>
        <div class="absolute inset-0 flex items-center justify-center opacity-30 group-hover:opacity-50 transition-opacity ${course.color.icon}">
          ${course.icon}
        </div>
        <div class="absolute top-3 right-3">
          <span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide">Live</span>
        </div>
      </div>
      <div class="p-4">
        <h3 class="text-sm font-semibold text-zinc-100 mb-1 truncate">${course.course_key}</h3>
        <div class="flex items-center gap-4 text-xs text-zinc-500 mb-3">
          <span>${course.total_users.toLocaleString()} Students</span>
        </div>
        <div class="flex items-center justify-between border-t border-border/50 pt-3 mt-1">
          <div>
            <div class="text-[10px] text-zinc-500 uppercase tracking-wider">Revenue</div>
            <div class="text-sm font-medium text-zinc-200">${formatCurrency(course.total_revenue)}</div>
          </div>
          <div class="text-right">
            <div class="text-[10px] text-zinc-500 uppercase tracking-wider">Active</div>
            <div class="text-sm font-medium text-zinc-200">${course.active_users.toLocaleString()}</div>
          </div>
        </div>
      </div>
      <div class="absolute inset-0 border-2 border-indigo-500/50 rounded-xl opacity-0 transition-opacity duration-200 pointer-events-none active-ring"></div>
    </button>
  `).join('')
}

// Select a course and update analytics
window.selectCourse = function(index) {
  selectedCourseIndex = index
  const course = allCourses[index]
  if (!course) return

  // Update card UI
  document.querySelectorAll('.course-card').forEach((el, i) => {
    if (i === index) {
      el.classList.add('active', 'opacity-100')
      el.classList.remove('opacity-75', 'hover:opacity-100')
      el.querySelector('.active-ring')?.classList.add('opacity-100')
    } else {
      el.classList.remove('active', 'opacity-100')
      el.classList.add('opacity-75', 'hover:opacity-100')
      el.querySelector('.active-ring')?.classList.remove('opacity-100')
    }
  })

  // Animate analytics section
  const container = document.getElementById('analytics-section')
  if (container) {
    container.classList.remove('animate-fade-in')
    void container.offsetWidth
    container.classList.add('animate-fade-in')
  }

  // Update title
  const titleEl = document.getElementById('analytics-title')
  if (titleEl) {
    titleEl.textContent = `Analytics: ${course.course_key}`
  }

  // Update stats
  document.getElementById('stat-sales').textContent = formatCurrency(course.total_revenue)
  document.getElementById('stat-students').textContent = course.total_users.toLocaleString()
  document.getElementById('stat-active').textContent = course.active_users.toLocaleString()
  
  // Calculate active percentage
  const activePercent = course.total_users > 0 
    ? Math.round((course.active_users / course.total_users) * 100) 
    : 0
  document.getElementById('stat-active-pct').textContent = `${activePercent}% of total`

  // Calculate average revenue per student
  const avgRevenue = course.total_users > 0 
    ? course.total_revenue / course.total_users 
    : 0
  document.getElementById('stat-avg').textContent = formatCurrency(avgRevenue)

  // Update chart
  updateChart(course, index)

  // Fetch and display recent enrollments for this course
  fetchRecentEnrollments(course.course_key)
}

// Update the chart for selected course with real data
function updateChart(course, index) {
  const line = document.getElementById('chart-path-line')
  const area = document.getElementById('chart-path-area')
  const xLabels = document.getElementById('chart-x-labels')
  
  if (!line || !area) return

  const color = course.color.line
  const monthlyData = courseMonthlyData[course.course_key] || []
  
  // If we have real monthly data, use it
  if (monthlyData.length >= 2) {
    // Calculate cumulative revenue over time
    let cumulative = 0
    const cumulativeData = monthlyData.map(m => {
      cumulative += m.revenue
      return { month: m.month, value: cumulative }
    })
    
    // Take last 6 months or all data if less
    const chartData = cumulativeData.slice(-6)
    
    const width = 1000
    const height = 240
    const padding = 20
    const maxValue = Math.max(...chartData.map(d => d.value)) || 1
    
    // Generate points
    const points = chartData.map((d, i) => {
      const x = chartData.length > 1 ? (i / (chartData.length - 1)) * width : width / 2
      const y = height - ((d.value / maxValue) * (height - padding))
      return { x, y }
    })
    
    // Create smooth path
    let chartPath = `M${points[0].x},${points[0].y}`
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]
      const curr = points[i]
      const cpx = (prev.x + curr.x) / 2
      chartPath += ` C${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`
    }
    
    line.setAttribute('d', chartPath)
    line.setAttribute('stroke', color)
    area.setAttribute('d', `${chartPath} L${width},250 L0,250 Z`)
    
    // Update X-axis labels
    if (xLabels) {
      xLabels.innerHTML = chartData.map(d => {
        const date = new Date(d.month)
        return `<span>${date.toLocaleDateString('en-US', { month: 'short' })}</span>`
      }).join('')
    }
  } else {
    // Fallback: Generate a simulated curve based on revenue
    const revenue = course.total_revenue
    const maxRevenue = Math.max(...allCourses.map(c => c.total_revenue)) || 1
    const normalizedHeight = 220 - (revenue / maxRevenue) * 180

    const chartPath = `M0,240 C150,235 300,225 450,${normalizedHeight + 40} C600,${normalizedHeight + 20} 750,${normalizedHeight + 10} 1000,${normalizedHeight}`

    line.setAttribute('d', chartPath)
    line.setAttribute('stroke', color)
    area.setAttribute('d', `${chartPath} L1000,250 L0,250 Z`)
    
    // Default labels
    if (xLabels) {
      const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov']
      xLabels.innerHTML = months.map(m => `<span>${m}</span>`).join('')
    }
  }
  
  // Update gradient color
  const gradient = document.getElementById('chartGradient')
  if (gradient) {
    gradient.innerHTML = `
      <stop offset="0%" stop-color="${color}" stop-opacity="0.25"></stop>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"></stop>
    `
  }
}

// Fetch recent enrollments for a course
async function fetchRecentEnrollments(courseKey) {
  const tableBody = document.getElementById('students-table')
  if (!tableBody) return

  // Show loading
  tableBody.innerHTML = `
    <tr>
      <td colspan="2" class="px-5 py-8 text-center text-zinc-500 text-xs">
        <div class="flex items-center justify-center gap-2">
          <div class="w-4 h-4 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin"></div>
          Loading...
        </div>
      </td>
    </tr>
  `

  // Fetch recent entitlements for this course
  const { data, error } = await supabase
    .from('entitlements')
    .select('email, granted_at')
    .eq('course_key', courseKey)
    .order('granted_at', { ascending: false })
    .limit(5)

  if (error) {
    console.error('Error fetching enrollments:', error)
    tableBody.innerHTML = `
      <tr>
        <td colspan="2" class="px-5 py-8 text-center text-red-400 text-xs">
          Error loading enrollments
        </td>
      </tr>
    `
    return
  }

  if (!data || data.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="2" class="px-5 py-8 text-center text-zinc-500 text-xs">
          No recent enrollments found.
        </td>
      </tr>
    `
    return
  }

  // Format time ago
  const timeAgo = (date) => {
    const now = new Date()
    const then = new Date(date)
    const diffMs = now - then
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  // Render enrollments
  tableBody.innerHTML = data.map(enrollment => {
    const initial = enrollment.email ? enrollment.email.charAt(0).toUpperCase() : '?'
    const emailDisplay = enrollment.email || 'Unknown'
    const nameGuess = enrollment.email ? enrollment.email.split('@')[0].replace(/[._]/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'Unknown'

    return `
      <tr class="hover:bg-surfaceHighlight/20 transition-colors">
        <td class="px-5 py-3">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-medium text-zinc-400 border border-zinc-700">
              ${initial}
            </div>
            <div>
              <div class="font-medium text-zinc-200 truncate max-w-[150px]">${nameGuess}</div>
              <div class="text-[10px] text-zinc-500 truncate max-w-[150px]">${emailDisplay}</div>
            </div>
          </div>
        </td>
        <td class="px-5 py-3 text-right">
          <div class="text-[10px] text-zinc-500">${timeAgo(enrollment.granted_at)}</div>
        </td>
      </tr>
    `
  }).join('')
}

// Export Courses to Excel
function setupExportCourses() {
  const exportBtn = document.getElementById('export-courses-btn')
  if (!exportBtn) return
  
  exportBtn.addEventListener('click', async () => {
    const now = new Date()
    const dateStr = now.toISOString().split('T')[0]
    
    // Create workbook
    const wb = XLSX.utils.book_new()
    
    // --- Sheet 1: Summary ---
    const summaryData = [
      [''],
      ['', 'VENDINGPRENEURS COURSES REPORT'],
      [''],
      ['', 'Generated:', now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })],
      ['', 'Time:', now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })],
      [''],
      [''],
      ['', 'COURSES OVERVIEW', ''],
      [''],
      ['', 'Total Active Products', allCourses.length],
      ['', 'Total Revenue', formatCurrency(allCourses.reduce((sum, c) => sum + c.total_revenue, 0))],
      ['', 'Total Students', allCourses.reduce((sum, c) => sum + c.total_users, 0).toLocaleString()],
      ['', 'Total Active Students', allCourses.reduce((sum, c) => sum + c.active_users, 0).toLocaleString()],
    ]
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
    wsSummary['!cols'] = [{ wch: 5 }, { wch: 30 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')
    
    // --- Sheet 2: Course Details ---
    const courseData = [
      [''],
      ['', 'COURSE DETAILS'],
      [''],
      [''],
      ['', 'RANK', 'COURSE NAME', 'REVENUE', 'STUDENTS', 'ACTIVE', 'ACTIVE %', 'REV/STUDENT'],
      ['']
    ]
    
    allCourses.forEach((course, index) => {
      const activePercent = course.total_users > 0 ? Math.round((course.active_users / course.total_users) * 100) : 0
      const revPerStudent = course.total_users > 0 ? course.total_revenue / course.total_users : 0
      
      courseData.push([
        '',
        index + 1,
        course.course_key,
        formatCurrency(course.total_revenue),
        course.total_users,
        course.active_users,
        `${activePercent}%`,
        formatCurrency(revPerStudent)
      ])
    })
    
    courseData.push([''])
    courseData.push(['', '─'.repeat(80)])
    courseData.push(['', 'TOTAL', '', 
      formatCurrency(allCourses.reduce((sum, c) => sum + c.total_revenue, 0)),
      allCourses.reduce((sum, c) => sum + c.total_users, 0),
      allCourses.reduce((sum, c) => sum + c.active_users, 0),
      '', ''
    ])
    
    const wsCourses = XLSX.utils.aoa_to_sheet(courseData)
    wsCourses['!cols'] = [{ wch: 5 }, { wch: 6 }, { wch: 35 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, wsCourses, 'Course Details')
    
    // --- Sheet 3: Monthly Revenue by Course ---
    const courseNames = Object.keys(courseMonthlyData)
    if (courseNames.length > 0) {
      // Get all unique months
      const allMonths = new Set()
      courseNames.forEach(course => {
        courseMonthlyData[course].forEach(m => allMonths.add(m.month))
      })
      const months = [...allMonths].sort()
      
      const monthlyData = [
        [''],
        ['', 'MONTHLY REVENUE BY COURSE'],
        [''],
        [''],
        ['', 'MONTH', ...courseNames.map(c => c.replace('Profit Machine ', 'PM '))],
        ['']
      ]
      
      months.forEach(month => {
        const monthDate = new Date(month)
        const row = [
          '',
          monthDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          ...courseNames.map(course => {
            const monthData = courseMonthlyData[course].find(m => m.month === month)
            return formatCurrency(monthData?.revenue || 0)
          })
        ]
        monthlyData.push(row)
      })
      
      const wsMonthly = XLSX.utils.aoa_to_sheet(monthlyData)
      wsMonthly['!cols'] = [{ wch: 5 }, { wch: 12 }, ...courseNames.map(() => ({ wch: 14 }))]
      XLSX.utils.book_append_sheet(wb, wsMonthly, 'Monthly by Course')
    }
    
    // Download the file
    XLSX.writeFile(wb, `VendingPreneurs-Courses-${dateStr}.xlsx`)
  })
}

// Run on load
loadCourses().then(() => {
  setupExportCourses()
})

