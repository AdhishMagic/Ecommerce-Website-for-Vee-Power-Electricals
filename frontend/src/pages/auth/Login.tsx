import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import AuthLayout from "../../components/layout/AuthLayout";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect") || "";
  
  const { login } = useAuth();

  const validateEmail = (emailStr: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(emailStr);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setEmailError("");
    setPasswordError("");
    
    let hasError = false;

    if (!email) {
      setEmailError("Please enter your email address");
      hasError = true;
    } else if (!validateEmail(email)) {
      setEmailError("Please enter a valid email address");
      hasError = true;
    }

    if (!password) {
      setPasswordError("Please enter your password");
      hasError = true;
    }

    if (hasError) return;

    setIsLoading(true);

    // Simulate network request and JWT issuance
    setTimeout(() => {
      if (email === "admin@veepower.com" && password === "admin456") {
        // Mock Admin JWT & User
        login("mock-jwt-token-admin", {
          id: "admin-1",
          email: "admin@veepower.com",
          name: "Vee Power Admin",
          role: "admin"
        }, redirect);
      } else if (password.length >= 6) {
        // Mock Common User JWT & User
        login("mock-jwt-token-user", {
          id: "user-1",
          email: email,
          name: "John Doe",
          role: "customer"
        }, redirect);
      } else {
        setError("Invalid email or password");
      }
      setIsLoading(false);
    }, 800);
  };

  return (
    <AuthLayout
      headline="Powering Your"
      headlineAccent="World Safely."
      description="Access your dashboard, manage orders, and explore exclusive deals on top electrical brands."
    >
      <h2 className="text-3xl font-bold text-charcoal mb-2" style={{ fontFamily: "Outfit" }}>Welcome Back</h2>
      <p className="text-muted mb-8">Please enter your details to sign in.</p>

      <form onSubmit={handleLogin} className="space-y-5" noValidate>
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100 flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-charcoal mb-1.5">Email Address</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted">
              <svg className={`w-5 h-5 ${emailError ? 'text-red-500' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError("");
              }}
              className={`w-full pl-10 pr-4 py-3 bg-bg border rounded-xl outline-none transition-all text-sm ${emailError ? 'border-red-500 focus:border-red-500 focus:ring-4 focus:ring-red-500/10' : 'border-border focus:bg-white focus:border-electric focus:ring-4 focus:ring-electric/10'}`}
              placeholder="name@example.com"
            />
          </div>
          {emailError && <p className="text-red-500 text-xs mt-1.5">{emailError}</p>}
        </div>

        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="block text-sm font-medium text-charcoal">Password</label>
            <Link to="/forgot-password" className="text-xs text-electric font-medium hover:underline">Forgot password?</Link>
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted">
              <svg className={`w-5 h-5 ${passwordError ? 'text-red-500' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            </div>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (passwordError) setPasswordError("");
              }}
              className={`w-full pl-10 pr-10 py-3 bg-bg border rounded-xl outline-none transition-all text-sm ${passwordError ? 'border-red-500 focus:border-red-500 focus:ring-4 focus:ring-red-500/10' : 'border-border focus:bg-white focus:border-electric focus:ring-4 focus:ring-electric/10'}`}
              placeholder="••••••••"
            />
            <button 
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-muted hover:text-charcoal transition-colors"
            >
              {showPassword ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.543 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              )}
            </button>
          </div>
          {passwordError && <p className="text-red-500 text-xs mt-1.5">{passwordError}</p>}
        </div>

        <div className="flex items-center mt-2">
          <input id="remember-me" type="checkbox" className="h-4 w-4 text-electric focus:ring-electric border-border rounded cursor-pointer" />
          <label htmlFor="remember-me" className="ml-2 block text-sm text-muted cursor-pointer">
            Remember me for 30 days
          </label>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-electric hover:bg-navy text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-md shadow-electric/20 mt-6"
        >
          {isLoading ? (
            <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            "Sign In"
          )}
        </button>
      </form>

      <div className="mt-8 text-center text-sm text-muted">
        Don't have an account? <Link to="/register" className="text-electric font-medium hover:underline">Create account</Link>
      </div>
    </AuthLayout>
  );
}
