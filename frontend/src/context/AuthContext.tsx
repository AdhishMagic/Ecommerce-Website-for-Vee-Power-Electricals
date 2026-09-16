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
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Check for existing token on mount
    const storedToken = localStorage.getItem("vp_token");
    const storedUser = localStorage.getItem("vp_user");
    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        setIsAuthenticated(true);
      } catch (e) {
        console.error("Failed to parse stored user", e);
        logout();
      }
    }
  }, []);

  const login = (newToken: string, newUser: User, redirectPath?: string) => {
    localStorage.setItem("vp_token", newToken);
    localStorage.setItem("vp_user", JSON.stringify(newUser));
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
    localStorage.removeItem("vp_token");
    localStorage.removeItem("vp_user");
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
