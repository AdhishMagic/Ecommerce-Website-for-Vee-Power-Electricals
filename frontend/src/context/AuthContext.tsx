import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";

interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "customer";
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
    return sessionStorage.getItem("vp_token");
  });
  
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return !!sessionStorage.getItem("vp_token") && !!sessionStorage.getItem("vp_user");
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
    sessionStorage.setItem("vp_role", newUser.role);
    setToken(newToken);
    setUser(newUser);
    setIsAuthenticated(true);
    
    if (redirectPath) {
      navigate(redirectPath);
    } else {
      navigate(newUser.role === "admin" ? "/admin" : "/account");
    }
  };

  const logout = () => {
    sessionStorage.removeItem("vp_token");
    sessionStorage.removeItem("vp_user");
    sessionStorage.removeItem("vp_role");
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
