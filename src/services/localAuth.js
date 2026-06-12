/**
 * Local Authentication Service
 * Provides offline user authentication using local database
 */

import { getDatabase, generateId, hashPassword, verifyPassword } from './localDatabase.js';

// Current user storage key
const SESSION_KEY = 'agristore_session';

// Session duration (7 days)
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;

/**
 * Get current logged in user
 */
export function getCurrentUser() {
  try {
    const session = localStorage.getItem(SESSION_KEY);
    if (!session) return null;
    
    const { user, expiresAt } = JSON.parse(session);
    
    // Check if session expired
    if (Date.now() > expiresAt) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    
    return user;
  } catch {
    return null;
  }
}

/**
 * Save user session
 */
function saveSession(user) {
  const session = {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    expiresAt: Date.now() + SESSION_DURATION,
  };
  
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

/**
 * Clear user session
 */
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

/**
 * Login with email and password (local auth)
 */
export async function loginLocal(email, password) {
  if (!email || !password) {
    throw new Error('Email and password are required');
  }

  const localDb = await getDatabase();
  const users = await localDb.getAll('users');
  
  // Find user by email (case insensitive)
  const user = users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
  
  if (!user) {
    throw new Error('User not found. Please check your email.');
  }
  
  // Verify password
  const isValid = await verifyPassword(password, user.password_hash);
  
  if (!isValid) {
    throw new Error('Invalid password. Please try again.');
  }
  
  // Save session
  saveSession(user);
  
  console.log('✅ Local login successful: ' + user.name);
  
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

/**
 * Register a new user (local)
 * Roles: 'manager' (full access), 'staff' (limited access)
 */
export async function registerLocal(name, email, password, role = 'staff') {
  if (!name || !email || !password) {
    throw new Error('Name, email, and password are required');
  }
  
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }

  const localDb = await getDatabase();
  const users = await localDb.getAll('users');
  
  // Check if email already exists
  const existingUser = users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
  if (existingUser) {
    throw new Error('A user with this email already exists');
  }
  
  // Hash password and create user
  const passwordHash = await hashPassword(password);
  
  const newUser = {
    id: generateId(),
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password_hash: passwordHash,
    role: role,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
  
  await localDb.put('users', newUser);
  
  console.log('✅ User registered: ' + name);
  
  // Return the full user record (incl. password_hash) so callers writing it
  // back to React state via setUsers() don't accidentally drop the hash on
  // the next replaceAll() flush.
  return newUser;
}

/**
 * Logout current user
 */
export function logoutLocal() {
  clearSession();
  console.log('✅ Logged out');
}

/**
 * Change password
 */
export async function changePassword(userId, currentPassword, newPassword) {
  if (!currentPassword || !newPassword) {
    throw new Error('Current and new passwords are required');
  }
  
  if (newPassword.length < 6) {
    throw new Error('New password must be at least 6 characters');
  }

  const localDb = await getDatabase();
  const user = await localDb.get('users', userId);
  
  if (!user) {
    throw new Error('User not found');
  }
  
  // Verify current password
  const isValid = await verifyPassword(currentPassword, user.password_hash);
  if (!isValid) {
    throw new Error('Current password is incorrect');
  }
  
  // Update password
  user.password_hash = await hashPassword(newPassword);
  user.updated_at = Date.now();
  
  await localDb.put('users', user);
  
  console.log('✅ Password changed successfully');
  return true;
}

/**
 * Update user profile
 */
export async function updateProfile(userId, updates) {
  const localDb = await getDatabase();
  const user = await localDb.get('users', userId);
  
  if (!user) {
    throw new Error('User not found');
  }
  
  // Update allowed fields
  if (updates.name) user.name = updates.name.trim();
  if (updates.email) user.email = updates.email.toLowerCase().trim();
  if (updates.role) user.role = updates.role;
  
  user.updated_at = Date.now();
  
  await localDb.put('users', user);
  
  // Update session if current user
  const currentUser = getCurrentUser();
  if (currentUser && currentUser.id === userId) {
    saveSession(user);
  }
  
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

/**
 * Get all users (for admin)
 */
export async function getAllUsers() {
  const localDb = await getDatabase();
  const users = await localDb.getAll('users');
  
  // Return without password hash
  return users.map(({ password_hash, ...user }) => user);
}

/**
 * Delete user (admin only)
 */
export async function deleteUser(userId) {
  const localDb = await getDatabase();
  await localDb.delete('users', userId);
  console.log('✅ User deleted: ' + userId);
  return true;
}

/**
 * Check if this is the first run (no users exist)
 */
export async function isFirstRun() {
  const localDb = await getDatabase();
  const users = await localDb.getAll('users');
  return users.length === 0;
}

/**
 * Create default admin user.
 * Always ensures admin@agristore.local exists with the default password,
 * even if other users are present (so a fresh-install user always has a way in).
 */
export async function createDefaultAdmin() {
  const localDb = await getDatabase();
  const users = await localDb.getAll('users');
  const existing = users.find(u => u.email && u.email.toLowerCase() === 'admin@agristore.local');
  if (existing) {
    return existing;
  }

  // Create default admin with Manager role (full access)
  const admin = await registerLocal(
    'Admin',
    'admin@agristore.local',
    'admin123',
    'manager'  // Manager has full access
  );
  
  console.log('✅ Default admin created: admin@agristore.local / admin123 (Manager role)');
  return admin;
}

export default {
  getCurrentUser,
  loginLocal,
  registerLocal,
  logoutLocal,
  changePassword,
  updateProfile,
  getAllUsers,
  deleteUser,
  isFirstRun,
  createDefaultAdmin,
};
