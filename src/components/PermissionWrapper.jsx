import React from 'react';
import { usePermission } from '../hooks/usePermission';

export const PermissionWrapper = ({ permission, children, fallback = null }) => {
  const { hasPermission } = usePermission();
  return hasPermission(permission) ? children : fallback;
};

export default PermissionWrapper;
