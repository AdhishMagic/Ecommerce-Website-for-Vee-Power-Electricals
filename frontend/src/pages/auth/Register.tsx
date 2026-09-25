import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import AuthLayout from "../../components/layout/AuthLayout";
import VeeElectricalsLoader, { AuthLoaderStatus } from "../../components/brand/VeeElectricalsLoader";
import { authService } from "../../services/authService";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthLoaderStatus>("idle");

  // Independent states for each password field toggle
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const navigate = useNavigate();

  const validateEmail = (emailStr: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(emailStr);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || authStatus === "submitting" || authStatus === "success") return;

    setError("");

    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      setError("Please fill out all fields.");
      return;
    }

    if (!validateEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    setIsLoading(true);
    setAuthStatus("submitting");

    const parts = name.trim().split(/\s+/);
    const first_name = parts[0] || "Customer";
    const last_name = parts.slice(1).join(" ") || "User";

    try {
      await authService.register({
        email: email.trim(),
        password,
        first_name,
        last_name,
      });

      setAuthStatus("success");
      setTimeout(() => {
        setIsLoading(false);
        navigate("/login?registered=true");
      }, 500);
    } catch (err: any) {
      const msg = err?.message || err?.detail || "Registration failed. Please check your details.";
      setError(msg);
      setAuthStatus("error");
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      headline="Join the"
      headlineAccent="Future of Power."
      description="Create an account to track your orders, save your addresses, and unlock professional discounts."
    >
      <div className="relative min-h-[480px] flex flex-col justify-center">
        {/* VEE ELECTRICALS Animated Loading Overlay */}
        <VeeElectricalsLoader
          status={authStatus}
          message="Creating Account..."
          successMessage="Account Created!"
        />

        <h2 className="text-3xl font-bold text-charcoal mb-2" style={{ fontFamily: "Outfit" }}>Create Account</h2>
        <p className="text-muted mb-6">Join us to manage orders and get exclusive deals.</p>

        {error && (
          <div className="bg-red-50 text-red-600 p-3.5 rounded-xl text-sm border border-red-100 flex items-center gap-2 mb-5">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4" noValidate>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-bg border border-border rounded-xl focus:bg-white focus:border-electric focus:ring-4 focus:ring-electric/10 outline-none transition-all text-sm"
              placeholder="John Doe"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-bg border border-border rounded-xl focus:bg-white focus:border-electric focus:ring-4 focus:ring-electric/10 outline-none transition-all text-sm"
              placeholder="name@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-bg border border-border rounded-xl focus:bg-white focus:border-electric focus:ring-4 focus:ring-electric/10 outline-none transition-all text-sm pr-11"
                placeholder="At least 6 characters"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-charcoal focus:outline-none transition-colors p-1"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Confirm Password</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 bg-bg border border-border rounded-xl focus:bg-white focus:border-electric focus:ring-4 focus:ring-electric/10 outline-none transition-all text-sm pr-11"
                placeholder="Repeat your password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-charcoal focus:outline-none transition-colors p-1"
                aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
              >
                {showConfirmPassword ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                )}
              </button>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 bg-electric hover:bg-electric-dark text-white font-semibold rounded-xl transition-all shadow-md shadow-electric/20 hover:shadow-lg hover:shadow-electric/30 active:scale-[0.99] disabled:opacity-50 text-sm"
            >
              Create Account
            </button>
          </div>
        </form>

        <p className="text-center text-sm text-muted mt-8">
          Already have an account?{" "}
          <Link to="/login" className="text-electric hover:text-electric-dark font-semibold transition-colors">
            Sign In
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
