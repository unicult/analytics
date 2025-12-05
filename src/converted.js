import { createClient } from '@supabase/supabase-js'

// Initialize Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// Frontend course keys
const FRONTEND_KEYS = [
  'Profit Machine System',
  'Profit Machine Maximizer', 
  'Rapid Scaling Blueprint',
  'Profit Machine Maximizer (3-Pay plan)'
]

// State
let allCustomers = []
let filteredCustomers = []
let currentPage = 0
let pageSize = 25
let currentSort = 'spend'
let totalConvertedCount = 0 // Store the actual total from the database

// Helper: Format currency
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
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

// Main load function
async function loadConverted() {
  console.log('Loading converted customers data...')

  // Fetch backend metrics
  const { data: backendData, error: backendError } = await supabase
    .from('backend_revenue_metrics')
    .select('*')
    .single()

  if (backendError) {
    console.error('Error fetching backend metrics:', backendError)
    return
  }

  console.log('Backend data fetched:', backendData)

  // Get top converted customers from the view
  const convertedList = backendData.top_converted_customers || []
  
  // Populate KPIs
  const totalConverted = backendData.converted_customers_count || 0
  totalConvertedCount = totalConverted // Store for pagination display
  const totalRevenue = parseFloat(backendData.total_backend_revenue) || 0
  const frontendCount = backendData.frontend_customers_count || 0
  const conversionRate = frontendCount > 0 ? ((totalConverted / frontendCount) * 100).toFixed(1) : 0
  const avgSpend = totalConverted > 0 ? totalRevenue / totalConverted : 0

  document.getElementById('kpi-converted').textContent = totalConverted.toLocaleString()
  document.getElementById('kpi-revenue').textContent = formatCurrency(totalRevenue)
  document.getElementById('kpi-rate').textContent = `${conversionRate}%`
  document.getElementById('kpi-avg').textContent = formatCurrency(avgSpend)

  // Update badge
  const badge = document.getElementById('converted-count-badge')
  if (badge) badge.textContent = totalConverted.toLocaleString()

  // Fetch entitlements for these customers to get frontend products
  if (convertedList.length > 0) {
    const emails = convertedList.map(c => c.email)
    
    const { data: entitlements, error: entError } = await supabase
      .from('entitlements')
      .select('email, course_key, price, granted_at')
      .in('email', emails)

    if (!entError && entitlements) {
      // Group by email
      const entByEmail = {}
      entitlements.forEach(ent => {
        if (!entByEmail[ent.email]) {
          entByEmail[ent.email] = { frontend: [], backend: [], latestDate: null }
        }
        
        if (FRONTEND_KEYS.includes(ent.course_key)) {
          entByEmail[ent.email].frontend.push(ent.course_key)
        } else {
          entByEmail[ent.email].backend.push({
            name: ent.course_key,
            price: parseFloat(ent.price) || 0
          })
        }
        
        // Track latest date
        if (!entByEmail[ent.email].latestDate || new Date(ent.granted_at) > new Date(entByEmail[ent.email].latestDate)) {
          entByEmail[ent.email].latestDate = ent.granted_at
        }
      })

      // Build customer list
      allCustomers = convertedList.map(customer => {
        const ent = entByEmail[customer.email] || { frontend: [], backend: [], latestDate: null }
        return {
          email: customer.email,
          totalBackendSpend: parseFloat(customer.total_backend_spend) || 0,
          backendProductCount: customer.products_purchased || 0,
          backendProducts: customer.products || ent.backend.map(b => b.name),
          frontendProducts: [...new Set(ent.frontend)],
          latestDate: ent.latestDate
        }
      })

      console.log(`Loaded ${allCustomers.length} converted customers`)
    }
  }

  // Initial sort and render
  sortCustomers()
  renderTable()
  setupEventListeners()

  console.log('Converted customers page loaded!')
}

// Sort customers
function sortCustomers() {
  filteredCustomers = [...allCustomers]
  
  // Apply search filter
  const searchQuery = document.getElementById('search-input')?.value?.toLowerCase() || ''
  if (searchQuery) {
    filteredCustomers = filteredCustomers.filter(c => 
      c.email.toLowerCase().includes(searchQuery)
    )
  }

  // Apply sort
  switch (currentSort) {
    case 'spend':
      filteredCustomers.sort((a, b) => b.totalBackendSpend - a.totalBackendSpend)
      break
    case 'products':
      filteredCustomers.sort((a, b) => b.backendProductCount - a.backendProductCount)
      break
    case 'recent':
      filteredCustomers.sort((a, b) => {
        if (!a.latestDate) return 1
        if (!b.latestDate) return -1
        return new Date(b.latestDate) - new Date(a.latestDate)
      })
      break
  }
}

// Render table
function renderTable() {
  const tbody = document.getElementById('customers-tbody')
  if (!tbody) return

  const start = currentPage * pageSize
  const end = Math.min(start + pageSize, filteredCustomers.length)
  const pageCustomers = filteredCustomers.slice(start, end)

  if (pageCustomers.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="px-6 py-16 text-center text-zinc-500">
          <div class="flex flex-col items-center gap-3">
            <div class="w-12 h-12 rounded-full bg-zinc-800/50 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-zinc-600"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="17" y1="11" x2="23" y2="11"></line></svg>
            </div>
            <div class="text-sm">No converted customers found</div>
          </div>
        </td>
      </tr>
    `
    updatePagination()
    return
  }

  tbody.innerHTML = pageCustomers.map((customer, index) => {
    const initials = getInitials(customer.email)
    const name = customer.email.split('@')[0].replace(/[._]/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    const rank = start + index + 1

    // Frontend products badges
    const frontendBadges = customer.frontendProducts.slice(0, 2).map(p => {
      const shortName = p.replace('Profit Machine ', 'PM ').replace(' (3-Pay plan)', ' 3-Pay')
      return `<span class="px-2 py-0.5 text-[10px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full">${shortName}</span>`
    }).join('')
    const moreFrontend = customer.frontendProducts.length > 2 ? 
      `<span class="px-2 py-0.5 text-[10px] font-medium bg-zinc-800 text-zinc-400 rounded-full">+${customer.frontendProducts.length - 2}</span>` : ''

    // Backend products badges
    const backendBadges = customer.backendProducts.slice(0, 2).map(p => {
      const name = typeof p === 'string' ? p : p.name
      const shortName = name.length > 20 ? name.substring(0, 20) + '...' : name
      return `<span class="px-2 py-0.5 text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full">${shortName}</span>`
    }).join('')
    const moreBackend = customer.backendProducts.length > 2 ? 
      `<span class="px-2 py-0.5 text-[10px] font-medium bg-zinc-800 text-zinc-400 rounded-full">+${customer.backendProducts.length - 2}</span>` : ''

    return `
      <tr class="hover:bg-surface/60 transition-all duration-200 group">
        <td class="px-6 py-4">
          <div class="flex items-center gap-3">
            <div class="relative">
              <div class="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-sm font-bold text-emerald-300">
                ${initials}
              </div>
              ${rank <= 3 ? `
                <div class="absolute -top-1 -right-1 w-5 h-5 bg-amber-500/20 border border-amber-500/40 rounded-full flex items-center justify-center">
                  <span class="text-[9px] font-bold text-amber-400">${rank}</span>
                </div>
              ` : ''}
            </div>
            <div>
              <div class="font-medium text-zinc-200 group-hover:text-white transition-colors">${name}</div>
              <div class="text-xs text-zinc-500 font-mono">${customer.email}</div>
            </div>
          </div>
        </td>
        <td class="px-6 py-4">
          <div class="flex flex-wrap gap-1">
            ${frontendBadges}
            ${moreFrontend}
          </div>
        </td>
        <td class="px-6 py-4">
          <div class="flex flex-wrap gap-1">
            ${backendBadges}
            ${moreBackend}
          </div>
        </td>
        <td class="px-6 py-4 text-right">
          <span class="text-amber-400 font-semibold">${formatCurrency(customer.totalBackendSpend)}</span>
        </td>
        <td class="px-6 py-4 text-right">
          <div class="flex items-center justify-end gap-2">
            <span class="text-zinc-400">${customer.frontendProducts.length + customer.backendProductCount}</span>
            <span class="text-[10px] text-zinc-600">(${customer.frontendProducts.length}F + ${customer.backendProductCount}B)</span>
          </div>
        </td>
        <td class="px-6 py-4">
          <button class="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-surfaceHighlight/50 rounded transition-all opacity-0 group-hover:opacity-100">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
          </button>
        </td>
      </tr>
    `
  }).join('')

  updatePagination()
}

// Update pagination
function updatePagination() {
  const total = filteredCustomers.length
  const searchQuery = document.getElementById('search-input')?.value?.toLowerCase() || ''
  // Use the actual database count when no search filter, otherwise show filtered count
  const displayTotal = searchQuery ? total : Math.max(total, totalConvertedCount)
  const start = currentPage * pageSize + 1
  const end = Math.min((currentPage + 1) * pageSize, total)
  const totalPages = Math.ceil(total / pageSize)

  const infoEl = document.getElementById('pagination-info')
  if (infoEl) {
    if (total === 0) {
      infoEl.textContent = 'No customers to display'
    } else if (searchQuery) {
      infoEl.textContent = `Showing ${start} to ${end} of ${total} customers (filtered)`
    } else if (total < totalConvertedCount) {
      // Show note when not all records are loaded
      infoEl.textContent = `Showing ${start} to ${end} of ${total} loaded (${totalConvertedCount} total)`
    } else {
      infoEl.textContent = `Showing ${start} to ${end} of ${displayTotal} customers`
    }
  }

  const controlsEl = document.getElementById('pagination-controls')
  if (!controlsEl) return

  if (totalPages <= 1) {
    controlsEl.innerHTML = ''
    return
  }

  let buttons = []
  
  // Previous button
  buttons.push(`
    <button class="p-1.5 rounded ${currentPage === 0 ? 'text-zinc-600 cursor-not-allowed' : 'text-zinc-400 hover:text-zinc-100 hover:bg-surfaceHighlight/50'}" 
            ${currentPage === 0 ? 'disabled' : ''} data-page="${currentPage - 1}">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
    </button>
  `)

  // Page numbers
  for (let i = 0; i < totalPages; i++) {
    if (i === 0 || i === totalPages - 1 || (i >= currentPage - 1 && i <= currentPage + 1)) {
      buttons.push(`
        <button class="w-8 h-8 rounded text-xs font-medium ${i === currentPage ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-100 hover:bg-surfaceHighlight/50'}" 
                data-page="${i}">${i + 1}</button>
      `)
    } else if (i === currentPage - 2 || i === currentPage + 2) {
      buttons.push('<span class="text-zinc-600 px-1">...</span>')
    }
  }

  // Next button
  buttons.push(`
    <button class="p-1.5 rounded ${currentPage >= totalPages - 1 ? 'text-zinc-600 cursor-not-allowed' : 'text-zinc-400 hover:text-zinc-100 hover:bg-surfaceHighlight/50'}" 
            ${currentPage >= totalPages - 1 ? 'disabled' : ''} data-page="${currentPage + 1}">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
    </button>
  `)

  controlsEl.innerHTML = buttons.join('')

  // Add click handlers
  controlsEl.querySelectorAll('button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = parseInt(btn.dataset.page)
      if (!isNaN(page) && page >= 0 && page < totalPages) {
        currentPage = page
        renderTable()
      }
    })
  })
}

// Setup event listeners
function setupEventListeners() {
  // Search
  const searchInput = document.getElementById('search-input')
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      currentPage = 0
      sortCustomers()
      renderTable()
    })
  }

  // Sort
  const sortSelect = document.getElementById('sort-select')
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      currentSort = e.target.value
      currentPage = 0
      sortCustomers()
      renderTable()
    })
  }

  // Page size
  const pageSizeSelect = document.getElementById('page-size-select')
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener('change', (e) => {
      pageSize = parseInt(e.target.value)
      currentPage = 0
      renderTable()
    })
  }

  // Export
  const exportBtn = document.getElementById('export-btn')
  if (exportBtn) {
    exportBtn.addEventListener('click', exportToExcel)
  }
}

// Export to Excel
function exportToExcel() {
  const now = new Date()
  const dateStr = now.toISOString().split('T')[0]
  
  const wb = XLSX.utils.book_new()

  // Summary sheet
  const summaryData = [
    [''],
    ['', 'VENDINGPRENEURS CONVERTED CUSTOMERS REPORT'],
    [''],
    ['', 'Generated:', now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })],
    ['', 'Time:', now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })],
    [''],
    [''],
    ['', 'CONVERSION METRICS', ''],
    [''],
    ['', 'Total Converted Customers', allCustomers.length],
    ['', 'Total Backend Revenue', formatCurrency(allCustomers.reduce((sum, c) => sum + c.totalBackendSpend, 0))],
    ['', 'Average Backend Spend', formatCurrency(allCustomers.length > 0 ? allCustomers.reduce((sum, c) => sum + c.totalBackendSpend, 0) / allCustomers.length : 0)],
  ]
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
  wsSummary['!cols'] = [{ wch: 5 }, { wch: 35 }, { wch: 25 }]
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')

  // Customers sheet
  if (allCustomers.length > 0) {
    const customerHeaders = ['', 'Rank', 'Email', 'Frontend Products', 'Backend Products', 'Backend Spend', 'Total Products']
    const customerRows = allCustomers.map((c, i) => [
      '',
      i + 1,
      c.email,
      c.frontendProducts.join(', '),
      c.backendProducts.map(p => typeof p === 'string' ? p : p.name).join(', '),
      c.totalBackendSpend,
      c.frontendProducts.length + c.backendProductCount
    ])
    
    const wsCustomers = XLSX.utils.aoa_to_sheet([
      [''],
      ['', 'CONVERTED CUSTOMERS'],
      ['', 'Frontend buyers who purchased high-ticket backend products'],
      [''],
      customerHeaders,
      ...customerRows
    ])
    wsCustomers['!cols'] = [{ wch: 5 }, { wch: 6 }, { wch: 35 }, { wch: 40 }, { wch: 40 }, { wch: 15 }, { wch: 15 }]
    XLSX.utils.book_append_sheet(wb, wsCustomers, 'Customers')
  }

  XLSX.writeFile(wb, `VendingPreneurs-Converted-Customers-${dateStr}.xlsx`)
}

// Initialize
document.addEventListener('DOMContentLoaded', loadConverted)

