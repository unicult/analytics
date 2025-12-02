import { createClient } from '@supabase/supabase-js'

// Initialize Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// Session key (must match auth.js)
const SESSION_KEY = 'vp_admin_session'
const PASSWORD_KEY = 'vp_admin_password'

// Get current password (from localStorage or default)
function getAdminPassword() {
  return localStorage.getItem(PASSWORD_KEY) || 'ModernAmenities2025'
}

// Set new password
function setAdminPassword(newPassword) {
  localStorage.setItem(PASSWORD_KEY, newPassword)
}

// Get session
function getSession() {
  try {
    const session = localStorage.getItem(SESSION_KEY)
    if (!session) return null
    return JSON.parse(session)
  } catch {
    return null
  }
}

// Logout
function logout() {
  localStorage.removeItem(SESSION_KEY)
  window.location.href = '/login.html'
}

// State
let admins = []
let deleteTargetEmail = null

// Load admins from Supabase
async function loadAdmins() {
  const { data, error } = await supabase
    .from('admins')
    .select('*')
    .order('created_at', { ascending: true })
  
  if (error) {
    console.error('Error loading admins:', error)
    return []
  }
  
  admins = data || []
  return admins
}

// Render admins table
function renderAdminsTable() {
  const tbody = document.getElementById('admins-table')
  const session = getSession()
  const currentEmail = session?.email?.toLowerCase()
  
  if (admins.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" class="px-6 py-8 text-center text-zinc-500 text-sm">No admins found</td>
      </tr>
    `
    return
  }
  
  tbody.innerHTML = admins.map(admin => {
    const isCurrentUser = admin.email.toLowerCase() === currentEmail
    const addedDate = admin.created_at 
      ? new Date(admin.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '—'
    
    return `
      <tr class="hover:bg-surface/30 transition-colors">
        <td class="px-6 py-4">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full ${isCurrentUser ? 'bg-indigo-500/20 border-indigo-500/30' : 'bg-zinc-800 border-zinc-700'} border flex items-center justify-center text-xs font-medium ${isCurrentUser ? 'text-indigo-300' : 'text-zinc-400'}">
              ${admin.email.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <div class="text-sm text-zinc-200">${admin.email}</div>
              ${isCurrentUser ? '<div class="text-xs text-indigo-400">You</div>' : ''}
            </div>
          </div>
        </td>
        <td class="px-6 py-4 text-sm text-zinc-400">${addedDate}</td>
        <td class="px-6 py-4 text-right">
          ${isCurrentUser 
            ? '<span class="text-xs text-zinc-600">Cannot remove yourself</span>'
            : `<button 
                class="delete-admin-btn p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" 
                data-email="${admin.email}"
                title="Remove admin"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
              </button>`
          }
        </td>
      </tr>
    `
  }).join('')
  
  // Add delete button listeners
  document.querySelectorAll('.delete-admin-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteTargetEmail = btn.dataset.email
      document.getElementById('delete-admin-email').textContent = deleteTargetEmail
      document.getElementById('delete-modal').classList.remove('hidden')
    })
  })
}

// Add new admin
async function addAdmin(email) {
  const { data, error } = await supabase
    .from('admins')
    .insert([{ email: email.toLowerCase() }])
    .select()
  
  if (error) {
    if (error.code === '23505') {
      throw new Error('This email is already an admin')
    }
    throw error
  }
  
  return data
}

// Remove admin
async function removeAdmin(email) {
  const { error } = await supabase
    .from('admins')
    .delete()
    .eq('email', email.toLowerCase())
  
  if (error) {
    throw error
  }
}

// Populate session info
function populateSessionInfo() {
  const session = getSession()
  
  if (session) {
    document.getElementById('session-email').textContent = session.email
    
    if (session.createdAt) {
      document.getElementById('session-started').textContent = new Date(session.createdAt).toLocaleString()
    }
    
    if (session.expiresAt) {
      document.getElementById('session-expires').textContent = new Date(session.expiresAt).toLocaleString()
    }
  }
}

// Initialize
async function init() {
  // Load and render admins
  await loadAdmins()
  renderAdminsTable()
  
  // Populate session info
  populateSessionInfo()
  
  // Setup Add Admin Modal
  const addAdminBtn = document.getElementById('add-admin-btn')
  const addAdminModal = document.getElementById('add-admin-modal')
  const closeModal = document.getElementById('close-modal')
  const modalBackdrop = document.getElementById('modal-backdrop')
  const cancelAddAdmin = document.getElementById('cancel-add-admin')
  const addAdminForm = document.getElementById('add-admin-form')
  const addAdminMessage = document.getElementById('add-admin-message')
  
  function openAddModal() {
    addAdminModal.classList.remove('hidden')
    document.getElementById('new-admin-email').value = ''
    addAdminMessage.classList.add('hidden')
  }
  
  function closeAddModal() {
    addAdminModal.classList.add('hidden')
  }
  
  addAdminBtn?.addEventListener('click', openAddModal)
  closeModal?.addEventListener('click', closeAddModal)
  modalBackdrop?.addEventListener('click', closeAddModal)
  cancelAddAdmin?.addEventListener('click', closeAddModal)
  
  addAdminForm?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const email = document.getElementById('new-admin-email').value.trim()
    
    try {
      await addAdmin(email)
      addAdminMessage.textContent = 'Admin added successfully!'
      addAdminMessage.className = 'mb-4 text-sm text-emerald-400'
      addAdminMessage.classList.remove('hidden')
      
      // Reload admins
      await loadAdmins()
      renderAdminsTable()
      
      // Close modal after delay
      setTimeout(closeAddModal, 1500)
    } catch (error) {
      addAdminMessage.textContent = error.message || 'Failed to add admin'
      addAdminMessage.className = 'mb-4 text-sm text-red-400'
      addAdminMessage.classList.remove('hidden')
    }
  })
  
  // Setup Delete Modal
  const deleteModal = document.getElementById('delete-modal')
  const deleteModalBackdrop = document.getElementById('delete-modal-backdrop')
  const cancelDelete = document.getElementById('cancel-delete')
  const confirmDelete = document.getElementById('confirm-delete')
  
  function closeDeleteModal() {
    deleteModal.classList.add('hidden')
    deleteTargetEmail = null
  }
  
  deleteModalBackdrop?.addEventListener('click', closeDeleteModal)
  cancelDelete?.addEventListener('click', closeDeleteModal)
  
  confirmDelete?.addEventListener('click', async () => {
    if (!deleteTargetEmail) return
    
    try {
      await removeAdmin(deleteTargetEmail)
      closeDeleteModal()
      
      // Reload admins
      await loadAdmins()
      renderAdminsTable()
    } catch (error) {
      console.error('Error removing admin:', error)
      alert('Failed to remove admin: ' + error.message)
    }
  })
  
  // Setup Password Form
  const passwordForm = document.getElementById('password-form')
  const passwordMessage = document.getElementById('password-message')
  
  passwordForm?.addEventListener('submit', (e) => {
    e.preventDefault()
    
    const currentPassword = document.getElementById('current-password').value
    const newPassword = document.getElementById('new-password').value
    const confirmPassword = document.getElementById('confirm-password').value
    
    // Validate current password
    if (currentPassword !== getAdminPassword()) {
      passwordMessage.textContent = 'Current password is incorrect'
      passwordMessage.className = 'text-sm text-red-400'
      passwordMessage.classList.remove('hidden')
      return
    }
    
    // Validate new password
    if (newPassword.length < 8) {
      passwordMessage.textContent = 'New password must be at least 8 characters'
      passwordMessage.className = 'text-sm text-red-400'
      passwordMessage.classList.remove('hidden')
      return
    }
    
    // Validate confirmation
    if (newPassword !== confirmPassword) {
      passwordMessage.textContent = 'New passwords do not match'
      passwordMessage.className = 'text-sm text-red-400'
      passwordMessage.classList.remove('hidden')
      return
    }
    
    // Update password
    setAdminPassword(newPassword)
    
    passwordMessage.textContent = 'Password updated successfully!'
    passwordMessage.className = 'text-sm text-emerald-400'
    passwordMessage.classList.remove('hidden')
    
    // Clear form
    passwordForm.reset()
    
    // Hide message after delay
    setTimeout(() => {
      passwordMessage.classList.add('hidden')
    }, 3000)
  })
  
  // Setup logout buttons
  document.getElementById('logout-btn')?.addEventListener('click', logout)
  document.getElementById('logout-btn-main')?.addEventListener('click', logout)
}

// Run on load
document.addEventListener('DOMContentLoaded', init)

