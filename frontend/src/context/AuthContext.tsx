import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { authService } from "../services/authService";
import { clearAuthStorage, getAccessToken } from "../api/client";

export interface User {
  id: string | number;
  email: string;
  name: string;
  role: "admin" | "customer" | "ADMIN" | "CUSTOMER";
  phone?: string | null;
  is_admin?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string, user: User, redirectPath?: string) => void;
  logout: () => void;
  requireAuth: (action: () => void) => void;
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const storedUser = sessionStorage.getItem("vp_user") || localStorage.getItem("vp_user");
    return storedUser ? JSON.parse(storedUser) : null;
  });

  const [token, setToken] = useState<string | null>(() => {
    return getAccessToken();
  });

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return !!getAccessToken() && !!(sessionStorage.getItem("vp_user") || localStorage.getItem("vp_user"));
  });

  const navigate = useNavigate();
  const location = useLocation();

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      clearAuthStorage();
    }
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
    navigate("/login");
  }, [navigate]);

  // Load and synchronize user on mount if token exists
  const refreshUser = useCallback(async (): Promise<User | null> => {
    const currentToken = getAccessToken();
    if (!currentToken) {
      setUser(null);
      setIsAuthenticated(false);
      return null;
    }

    try {
      const currentUser = await authService.getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
        setIsAuthenticated(true);
        sessionStorage.setItem("vp_user", JSON.stringify(currentUser));
        localStorage.setItem("vp_user", JSON.stringify(currentUser));
        return currentUser;
      } else {
        await logout();
        return null;
      }
    } catch {
      await logout();
      return null;
    }
  }, [logout]);

  useEffect(() => {
    if (getAccessToken()) {
      refreshUser();
    }

    // Listen to session expired event from API client
    const handleSessionExpired = () => {
      logout();
    };

    window.addEventListener("auth_session_expired", handleSessionExpired);
    return () => {
      window.removeEventListener("auth_session_expired", handleSessionExpired);
    };
  }, [refreshUser, logout]);

  const login = (newToken: string, newUser: User, redirectPath?: string) => {
    sessionStorage.setItem("vp_token", newToken);
    sessionStorage.setItem("vp_user", JSON.stringify(newUser));
    sessionStorage.setItem("vp_role", String(newUser.role));
    localStorage.setItem("auth_token", newToken);
    localStorage.setItem("vp_user", JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    setIsAuthenticated(true);

    const isAdmin = newUser.role?.toLowerCase() === "admin" || newUser.is_admin === true;
    if (redirectPath) {
      if (!isAdmin && redirectPath.startsWith('/admin')) {
        navigate("/account");
      } else {
        navigate(redirectPath);
      }
    } else {
      navigate(isAdmin ? "/admin" : "/account");
    }
  };

  // Middleware function for actions requiring authentication
  const requireAuth = (action: () => void) => {
    if (isAuthenticated) {
      action();
    } else {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated, login, logout, requireAuth, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
