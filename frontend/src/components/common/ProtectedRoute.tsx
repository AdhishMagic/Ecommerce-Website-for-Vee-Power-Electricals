import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { ReactNode } from "react";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: ("admin" | "customer" | "ADMIN" | "CUSTOMER")[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated || !user) {
    // Redirect to login and save the original location they were trying to access
    if (location.pathname.startsWith('/admin')) {
      return <Navigate to={`/admin/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
    }
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }

  const userRole = user.role?.toLowerCase();
  const isAllowed =
    !allowedRoles ||
    allowedRoles.some((r) => r.toLowerCase() === userRole) ||
    (user.is_admin && allowedRoles.some((r) => r.toLowerCase() === "admin"));

  if (!isAllowed) {
    // User is authenticated but doesn't have the right role for this route.
    if (location.pathname.startsWith('/admin')) {
      return <Navigate to={`/admin/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
    }
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }

  return <>{children}</>;
}
