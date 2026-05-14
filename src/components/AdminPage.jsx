const AdminPage = ({ rows, loading, onApprove, onReject }) => {
  return (
    <div className="admin-page">
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
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '1rem' }}>No pending approvals.</td>
              </tr>
            ) : rows.map((row) => (
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
    </div>
  );
};

export default AdminPage;
