import { useState, useEffect } from 'react'
import { usersApi } from '../services/api'
import { useAuth } from '../context/AuthContext'

interface User {
  id: number
  email: string
  name: string
  role: 'admin' | 'analyst' | 'viewer'
  createdAt: string
}

function Users() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      const res = await usersApi.getAll()
      setUsers(res.data)
    } catch (err) {
      console.error('Failed to load users:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleRoleChange = async (userId: number, newRole: string) => {
    try {
      await usersApi.updateRole(userId, newRole)
      loadUsers()
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } }
      setError(error.response?.data?.message || 'Failed to update role')
    }
  }

  const handleDelete = async (userId: number) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return
    }

    try {
      await usersApi.delete(userId)
      loadUsers()
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } }
      setError(error.response?.data?.message || 'Failed to delete user')
    }
  }

  if (loading) {
    return <div className="loading">Loading users...</div>
  }

  return (
    <div className="users-page">
      <div className="page-header">
        <h1 className="page-title">User Management</h1>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
          {error}
          <button
            onClick={() => setError('')}
            style={{ marginLeft: '1rem', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
      )}

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    {user.name}
                    {user.id === currentUser?.id && (
                      <span className="badge badge-info" style={{ marginLeft: '0.5rem' }}>You</span>
                    )}
                  </td>
                  <td>{user.email}</td>
                  <td>
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      disabled={user.id === currentUser?.id}
                      className="role-select"
                    >
                      <option value="admin">Admin</option>
                      <option value="analyst">Analyst</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </td>
                  <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button
                      className="btn btn-danger"
                      style={{ padding: '0.25rem 0.75rem' }}
                      onClick={() => handleDelete(user.id)}
                      disabled={user.id === currentUser?.id}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 className="card-title" style={{ marginBottom: '1rem' }}>Role Permissions</h2>
        <div className="permissions-table">
          <table>
            <thead>
              <tr>
                <th>Permission</th>
                <th>Admin</th>
                <th>Analyst</th>
                <th>Viewer</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>View dashboard & reports</td>
                <td>✓</td>
                <td>✓</td>
                <td>✓</td>
              </tr>
              <tr>
                <td>View products & inventory</td>
                <td>✓</td>
                <td>✓</td>
                <td>✓</td>
              </tr>
              <tr>
                <td>Add/edit products</td>
                <td>✓</td>
                <td>✓</td>
                <td>-</td>
              </tr>
              <tr>
                <td>Update inventory</td>
                <td>✓</td>
                <td>✓</td>
                <td>-</td>
              </tr>
              <tr>
                <td>Add demand records</td>
                <td>✓</td>
                <td>✓</td>
                <td>-</td>
              </tr>
              <tr>
                <td>Generate forecasts</td>
                <td>✓</td>
                <td>✓</td>
                <td>-</td>
              </tr>
              <tr>
                <td>Import data</td>
                <td>✓</td>
                <td>✓</td>
                <td>-</td>
              </tr>
              <tr>
                <td>Manage users</td>
                <td>✓</td>
                <td>-</td>
                <td>-</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .role-select {
          padding: 0.25rem 0.5rem;
          border: 1px solid var(--border);
          border-radius: 0.375rem;
          background-color: var(--surface);
          cursor: pointer;
        }
        .role-select:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .permissions-table td:not(:first-child),
        .permissions-table th:not(:first-child) {
          text-align: center;
        }
        .permissions-table td:first-child {
          font-weight: 500;
        }
      `}</style>
    </div>
  )
}

export default Users
