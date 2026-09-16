import { useState } from "react";
import { Link } from "react-router-dom";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const validateEmail = (emailStr: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(emailStr);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email) {
      setError("Please enter your email address.");
      return;
    }

    if (!validateEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    setIsLoading(true);

    // Simulate sending email request
    setTimeout(() => {
      setIsLoading(false);
      setIsSubmitted(true);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-[#F6F8FA] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 sm:p-10 border border-[#D9E1E8]">
        
        <div className="flex justify-center mb-6">
          <div className="w-12 h-12 bg-[#0B3A63] rounded-xl flex items-center justify-center shadow-md">
            <span className="text-[#F2A900] font-bold text-2xl" style={{ fontFamily: "Outfit" }}>V</span>
          </div>
        </div>

        {!isSubmitted ? (
          <>
            <h2 className="text-2xl font-bold text-[#17212B] text-center mb-2" style={{ fontFamily: "Outfit" }}>Forgot Password</h2>
            <p className="text-[#667085] text-center text-sm mb-8">
              Enter the email address associated with your account and we'll send you a link to reset your password.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100 flex items-center gap-2">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {error}
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-[#17212B] mb-1.5">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl focus:bg-white focus:border-[#1769AA] focus:ring-4 focus:ring-[#1769AA]/10 outline-none transition-all text-sm"
                  placeholder="name@example.com"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#1769AA] hover:bg-[#0B3A63] text-white font-medium py-3 rounded-xl transition-all shadow-md mt-2"
              >
                {isLoading ? "Sending..." : "Send Reset Link"}
              </button>
            </form>
          </>
        ) : (
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
            <h2 className="text-2xl font-bold text-[#17212B] mb-2" style={{ fontFamily: "Outfit" }}>Check your email</h2>
            <p className="text-[#667085] text-sm mb-8">
              We have sent a password reset link to <span className="font-medium text-[#17212B]">{email}</span>.
            </p>
          </div>
        )}

        <div className="mt-8 text-center text-sm">
          <Link to="/login" className="text-[#1769AA] font-medium hover:underline flex items-center justify-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
