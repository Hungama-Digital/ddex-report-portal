const ConfirmDialog = ({ open, title, message, onConfirm, onCancel, loading = false }) => {
  if (!open) {
    return null;
  }

  return (
    <div className="confirm-overlay" onClick={loading ? undefined : onCancel}>
      <div className="confirm-dialog" onClick={(event) => event.stopPropagation()}>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="confirm-actions">
          <button onClick={onCancel} disabled={loading}>Cancel</button>
          <button className="confirm-primary" onClick={onConfirm} disabled={loading}>
            {loading ? 'Please wait...' : 'Yes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
