import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";

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
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const storedUser = sessionStorage.getItem("vp_user");
    return storedUser ? JSON.parse(storedUser) : null;
  });
  
  const [token, setToken] = useState<string | null>(() => {
    return sessionStorage.getItem("vp_token") || localStorage.getItem("auth_token");
  });
  
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return (!!sessionStorage.getItem("vp_token") || !!localStorage.getItem("auth_token")) && !!sessionStorage.getItem("vp_user");
  });
  
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // If the token or user becomes invalid, we could add logic here
    // but the initial state is already set synchronously above.
  }, []);

  const login = (newToken: string, newUser: User, redirectPath?: string) => {
    sessionStorage.setItem("vp_token", newToken);
    sessionStorage.setItem("vp_user", JSON.stringify(newUser));
    sessionStorage.setItem("vp_role", String(newUser.role));
    localStorage.setItem("auth_token", newToken);
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

  const logout = () => {
    sessionStorage.removeItem("vp_token");
    sessionStorage.removeItem("vp_user");
    sessionStorage.removeItem("vp_role");
    localStorage.removeItem("auth_token");
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
    navigate("/login");
  };

  // Middleware function for actions
  const requireAuth = (action: () => void) => {
    if (isAuthenticated) {
      action();
    } else {
      // Redirect to login and save the current path to return back after login
      navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated, login, logout, requireAuth }}>
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
