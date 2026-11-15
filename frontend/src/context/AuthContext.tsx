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
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  login: (token: string, user: User, redirectPath?: string) => void;
  logout: () => void;
  requireAuth: (action: () => void) => void;
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

let activeRefreshPromise: Promise<User | null> | null = null;

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

  // A stored token is not proof of a valid session. Until it has been confirmed
  // against the backend, protected pages must not mount: otherwise every admin
  // effect fires its own authenticated request in parallel and they all 401 at once.
  const [isBootstrapping, setIsBootstrapping] = useState<boolean>(() => !!getAccessToken());

  const navigate = useNavigate();
  const location = useLocation();

  const logout = useCallback(async () => {
    const wasAdminRoute = window.location.pathname.startsWith("/admin");
    try {
      await authService.logout();
    } catch {
      clearAuthStorage();
    }
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
    setIsBootstrapping(false);
    navigate(wasAdminRoute ? "/admin/login" : "/login");
  }, [navigate]);

  // Load and synchronize user on mount if token exists (deduplicated across React StrictMode)
  const refreshUser = useCallback(async (): Promise<User | null> => {
    if (activeRefreshPromise) {
      return activeRefreshPromise;
    }

    const currentToken = getAccessToken();
    if (!currentToken) {
      setUser(null);
      setIsAuthenticated(false);
      return null;
    }

    activeRefreshPromise = (async () => {
      try {
        const currentUser = await authService.getCurrentUser();
        if (currentUser) {
          setUser(currentUser);
          setIsAuthenticated(true);
          sessionStorage.setItem("vp_user", JSON.stringify(currentUser));
          localStorage.setItem("vp_user", JSON.stringify(currentUser));
          return currentUser;
        } else {
          // Token is invalid/expired: clear locally without firing redundant server calls
          clearAuthStorage();
          setToken(null);
          setUser(null);
          setIsAuthenticated(false);
          return null;
        }
      } catch {
        // Any error fetching current user (e.g. 401) means stored token is invalid
        clearAuthStorage();
        setToken(null);
        setUser(null);
        setIsAuthenticated(false);
        return null;
      } finally {
        activeRefreshPromise = null;
      }
    })();

    return activeRefreshPromise;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrapSession = async () => {
      if (!getAccessToken()) {
        setIsBootstrapping(false);
        return;
      }
      // Confirm the stored token before any protected content mounts.
      await refreshUser();
      if (!cancelled) setIsBootstrapping(false);
    };

    bootstrapSession();

    // Listen to session expired event from API client
    const handleSessionExpired = () => {
      clearAuthStorage();
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
      setIsBootstrapping(false);

      const { pathname, search } = window.location;
      // Already on an auth screen: never stack a redirect on top of it.
      if (
        pathname === "/login" ||
        pathname === "/admin/login" ||
        pathname === "/register" ||
        pathname === "/forgot-password" ||
        pathname === "/reset-password"
      ) return;

      // Only redirect to login if the current route strictly requires authentication!
      // Public pages (Home /, Shop /shop, Product /product/:id, /cart, /categories, /brands, etc.)
      // must NEVER kick a visitor to /login.
      const isProtectedRoute =
        pathname.startsWith("/admin") ||
        pathname.startsWith("/account") ||
        pathname.startsWith("/checkout") ||
        pathname.startsWith("/order-success");

      if (isProtectedRoute) {
        const redirect = encodeURIComponent(pathname + search);
        if (pathname.startsWith("/admin")) {
          navigate(`/admin/login?redirect=${redirect}`);
        } else {
          navigate(`/login?redirect=${redirect}`);
        }
      }
    };

    window.addEventListener("auth_session_expired", handleSessionExpired);
    return () => {
      cancelled = true;
      window.removeEventListener("auth_session_expired", handleSessionExpired);
    };
  }, [refreshUser, navigate]);

  const login = (newToken: string, newUser: User, redirectPath?: string) => {
    sessionStorage.setItem("vp_token", newToken);
    sessionStorage.setItem("vp_user", JSON.stringify(newUser));
    sessionStorage.setItem("vp_role", String(newUser.role));
    localStorage.setItem("auth_token", newToken);
    localStorage.setItem("auth_access_token", newToken);
    localStorage.setItem("vp_user", JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    setIsAuthenticated(true);

    const isAdmin = newUser.role?.toLowerCase() === "admin" || newUser.is_admin === true;
    const defaultCustomerPath = "/";
    const dashboardPath = isAdmin ? "/admin" : "/account";

    const cleanPath = redirectPath ? redirectPath.split("?")[0].split("#")[0] : "";
    const isAuthPath =
      cleanPath === "/login" ||
      cleanPath === "/admin/login" ||
      cleanPath === "/register" ||
      cleanPath === "/forgot-password" ||
      cleanPath === "/reset-password";

    // If a specific destination was requested (e.g. /checkout, /cart, /shop, /product/...), honor it;
    // otherwise (empty or auth URLs), route customers to storefront "/" and admins to "/admin".
    if (redirectPath && !isAuthPath) {
      if (!isAdmin && redirectPath.startsWith("/admin")) {
        navigate(dashboardPath);
      } else {
        navigate(redirectPath);
      }
    } else {
      navigate(isAdmin ? "/admin" : defaultCustomerPath);
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
    <AuthContext.Provider value={{ user, token, isAuthenticated, isBootstrapping, login, logout, requireAuth, refreshUser }}>
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
