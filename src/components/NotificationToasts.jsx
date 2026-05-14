const NotificationToasts = ({ toasts, onDismiss }) => {
  if (!toasts?.length) {
    return null;
  }

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast-item ${toast.type || 'info'}`}>
          <div>
            <strong>{toast.title || 'Notification'}</strong>
            <p>{toast.message}</p>
          </div>
          <button onClick={() => onDismiss(toast.id)}>x</button>
        </div>
      ))}
    </div>
  );
};

export default NotificationToasts;
