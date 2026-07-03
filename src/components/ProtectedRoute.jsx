import React from 'react';
import { Result, Button } from 'antd';
import { usePermission } from '../hooks/usePermission';

export const ProtectedRoute = ({ permission, children }) => {
  const { hasPermission } = usePermission();

  if (!hasPermission(permission)) {
    return (
      <div style={{ padding: '2rem', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Result
          status="403"
          title="403"
          subTitle="Sorry, you are not authorized to access this page."
          extra={
            <Button type="primary" onClick={() => window.location.reload()}>
              Refresh Page
            </Button>
          }
        />
      </div>
    );
  }

  return children;
};

export default ProtectedRoute;
