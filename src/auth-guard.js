// Auth Guard - Protects dashboard pages
// Uses simple localStorage session (not Supabase Auth)

// Session storage key (must match auth.js)
const SESSION_KEY = 'vp_admin_session'

// Get session from localStorage
function getSession() {
  try {
    const session = localStorage.getItem(SESSION_KEY)
    if (!session) return null
    
    const parsed = JSON.parse(session)
    
    // Check if session is expired (24 hours)
    if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
      localStorage.removeItem(SESSION_KEY)
      return null
    }
    
    return parsed
  } catch {
    return null
  }
}

// Clear session
function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}

// Logout function
function logout() {
  clearSession()
  window.location.href = '/vendingpreneurs/login.html'
}

// Get current user
function getCurrentUser() {
  const session = getSession()
  return session ? { email: session.email } : null
}

// Check auth and redirect if not logged in
function checkAuthAndRedirect() {
  const session = getSession()
  
  if (!session) {
    // Not authenticated, redirect to login
    window.location.href = '/vendingpreneurs/login.html'
    return null
  }
  
  return session
}

// Setup logout button
function setupLogoutButton() {
  const logoutBtn = document.getElementById('logout-btn')
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault()
      logout()
    })
  }
}

// Display user info in sidebar
function displayUserInfo() {
  const session = getSession()
  if (!session) return
  
  const userEmailEl = document.getElementById('user-email')
  const userAvatarEl = document.getElementById('user-avatar')
  
  if (userEmailEl) {
    userEmailEl.textContent = session.email
  }
  
  if (userAvatarEl) {
    // Get initials from email
    const initials = session.email.split('@')[0].substring(0, 2).toUpperCase()
    userAvatarEl.textContent = initials
  }
}

// Initialize auth guard
function initAuthGuard() {
  const session = checkAuthAndRedirect()
  
  if (session) {
    // User is authenticated, setup UI elements
    setupLogoutButton()
    displayUserInfo()
  }
  
  return session
}

// Run auth check immediately
const session = initAuthGuard()

// Export for use in other modules
export { session, logout, getCurrentUser }
