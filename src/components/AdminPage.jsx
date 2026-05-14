const AdminPage = ({ rows, activeUsers, loading, onApprove, onReject, onRevoke }) => {
  const approvals = Array.isArray(rows) ? rows : [];
  const users = Array.isArray(activeUsers) ? activeUsers : [];

  return (
    <div className="admin-page">
      <section className="admin-section">
        <h2>Admin</h2>
        <p>Approval requests from new users</p>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Requested At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '1rem' }}>Loading approvals...</td>
                </tr>
              ) : approvals.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '1rem' }}>No pending approvals.</td>
                </tr>
              ) : approvals.map((row) => (
                <tr key={row.id}>
                  <td>{row.username}</td>
                  <td>{row.email}</td>
                  <td>{String(row.createdAt || '').replace('T', ' ').slice(0, 19)}</td>
                  <td>
                    <div className="admin-actions">
                      <button className="approve-btn" onClick={() => onApprove(row.id)}>Approve</button>
                      <button className="reject-btn" onClick={() => onReject(row.id)}>Reject</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section">
        <h2>Current Active Users</h2>
        <p>Name, username, email, encoded password hash and revoke option.</p>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Email</th>
                <th>Password (Hash)</th>
                <th>Role</th>
                <th>Approved At</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '1rem' }}>Loading users...</td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '1rem' }}>No active users found.</td>
                </tr>
              ) : users.map((user) => {
                const isAdmin = String(user.role || '').toLowerCase() === 'admin';
                return (
                  <tr key={user.id}>
                    <td>{user.name || user.username}</td>
                    <td>{user.username}</td>
                    <td>{user.email}</td>
                    <td className="admin-hash-cell">{user.passwordHash || '-'}</td>
                    <td>{isAdmin ? 'Admin' : 'User'}</td>
                    <td>{user.approvedAt ? String(user.approvedAt).replace('T', ' ').slice(0, 19) : '-'}</td>
                    <td>
                      {isAdmin ? (
                        <span className="admin-role-note">Primary Admin</span>
                      ) : (
                        <button className="revoke-btn" onClick={() => onRevoke(user.id)}>Revoke Access</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default AdminPage;
