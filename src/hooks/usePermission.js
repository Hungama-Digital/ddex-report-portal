import { useSelector } from 'react-redux';

export function usePermission() {
  const { permissions, user } = useSelector((state) => state.auth) || { permissions: [], user: null };

  const hasPermission = (permissionCode) => {
    if (!user) return false;
    
    // Super admins and primary admins bypass all permission checks
    const roleSlug = String(user.role || '').toLowerCase();
    if (roleSlug === 'super-admin' || roleSlug === 'admin') {
      return true;
    }
    
    return permissions.includes(permissionCode);
  };

  return { hasPermission, permissions, user };
}

export default usePermission;
