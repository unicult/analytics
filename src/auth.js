import { createClient } from '@supabase/supabase-js'

// Initialize Supabase (for checking admins table only, not for auth)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// Admin password storage key
const PASSWORD_KEY = 'vp_admin_password'
const DEFAULT_PASSWORD = 'ModernAmenities2025'

// Get current admin password
function getAdminPassword() {
  return localStorage.getItem(PASSWORD_KEY) || DEFAULT_PASSWORD
}

// Session storage key
const SESSION_KEY = 'vp_admin_session'

// Check if we're on the login page
const isLoginPage = window.location.pathname.includes('login.html') || window.location.pathname === '/login'

// ============================================
// SESSION MANAGEMENT
// ============================================
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

function setSession(email) {
  const session = {
    email,
    createdAt: Date.now(),
    expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}

// ============================================
// AUTH CHECK
// ============================================
export function checkAuth() {
  return getSession()
}

export function isAuthenticated() {
  return getSession() !== null
}

// ============================================
// LOGOUT
// ============================================
export function logout() {
  clearSession()
  window.location.href = '/login.html'
}

// ============================================
// GET CURRENT USER
// ============================================
export function getCurrentUser() {
  const session = getSession()
  return session ? { email: session.email } : null
}

// ============================================
// LOGIN PAGE UI LOGIC
// ============================================
if (isLoginPage) {
  document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form')
    const errorMessage = document.getElementById('error-message')
    const errorText = document.getElementById('error-text')
    const successMessage = document.getElementById('success-message')
    const successText = document.getElementById('success-text')
    const submitBtn = document.getElementById('submit-btn')
    const btnText = document.getElementById('btn-text')
    const btnLoading = document.getElementById('btn-loading')
    const togglePassword = document.getElementById('toggle-password')
    const passwordInput = document.getElementById('password')
    const eyeIcon = document.getElementById('eye-icon')
    const eyeOffIcon = document.getElementById('eye-off-icon')
    
    // Check if already logged in
    if (isAuthenticated()) {
      window.location.href = '/index.html'
      return
    }
    
    // Toggle password visibility
    togglePassword?.addEventListener('click', () => {
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password'
      passwordInput.setAttribute('type', type)
      eyeIcon.classList.toggle('hidden')
      eyeOffIcon.classList.toggle('hidden')
    })
    
    // Show error
    function showError(message) {
      errorText.textContent = message
      errorMessage.classList.remove('hidden')
      successMessage?.classList.add('hidden')
    }
    
    // Show success
    function showSuccess(message) {
      if (successText) successText.textContent = message
      successMessage?.classList.remove('hidden')
      errorMessage.classList.add('hidden')
    }
    
    // Hide messages
    function hideMessages() {
      errorMessage.classList.add('hidden')
      successMessage?.classList.add('hidden')
    }
    
    // Set loading state
    function setLoading(loading) {
      submitBtn.disabled = loading
      if (loading) {
        btnText.classList.add('invisible')
        btnLoading.classList.remove('hidden')
      } else {
        btnText.classList.remove('invisible')
        btnLoading.classList.add('hidden')
      }
    }
    
    // Handle login form submission
    loginForm?.addEventListener('submit', async (e) => {
      e.preventDefault()
      hideMessages()
      setLoading(true)
      
      const email = document.getElementById('email').value.trim().toLowerCase()
      const password = document.getElementById('password').value
      
      try {
        // Step 1: Check password
        if (password !== getAdminPassword()) {
          showError('Invalid password. Please try again.')
          setLoading(false)
          return
        }
        
        // Step 2: Check if email is in admins table
        const { data: adminData, error: adminError } = await supabase
          .from('admins')
          .select('email')
          .eq('email', email)
          .single()
        
        console.log('Admin check:', { adminData, adminError })
        
        if (adminError || !adminData) {
          showError('Access denied. This email is not authorized for admin access.')
          setLoading(false)
          return
        }
        
        // Step 3: Create session and redirect
        setSession(email)
        showSuccess('Login successful! Redirecting...')
        
        setTimeout(() => {
          window.location.href = '/index.html'
        }, 800)
        
      } catch (error) {
        console.error('Login error:', error)
        showError('An error occurred. Please try again.')
        setLoading(false)
      }
    })
  })
}

// Export supabase client for use in other modules (data fetching)
export { supabase }
