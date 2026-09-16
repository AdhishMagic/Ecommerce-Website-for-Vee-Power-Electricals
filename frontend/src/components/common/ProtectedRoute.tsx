import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { ReactNode } from "react";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: ("admin" | "customer")[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated || !user) {
    // Redirect to login and save the original location they were trying to access
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // User is authenticated but doesn't have the right role (e.g., customer trying to access admin)
    // Redirect them to their appropriate dashboard
    return <Navigate to={user.role === "admin" ? "/admin" : "/account"} replace />;
  }

  return <>{children}</>;
}
