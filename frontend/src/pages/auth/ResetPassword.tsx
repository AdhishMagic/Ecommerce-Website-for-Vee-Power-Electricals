import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import VeeElectricalsLogo from "../../components/brand/VeeElectricalsLogo";
import { authApi } from "../../api/auth";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const [uidb64, setUidb64] = useState(searchParams.get("uid") || "");
  const [token, setToken] = useState(searchParams.get("token") || "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!uidb64 || !token) {
      setError("Reset link is invalid or missing verification codes (UID/Token).");
      return;
    }

    if (!newPassword) {
      setError("Please enter your new password.");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);

    try {
      await authApi.confirmPasswordReset({
        uidb64,
        token,
        new_password: newPassword,
      });
      setIsLoading(false);
      setIsSuccess(true);
    } catch (err: any) {
      setIsLoading(false);
      setError(err?.message || "Failed to reset password. The link may have expired.");
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F8FA] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 sm:p-10 border border-[#D9E1E8]">
        <div className="flex justify-center mb-6">
          <Link to="/">
            <VeeElectricalsLogo variant="full" size="md" id="reset-password-logo" />
          </Link>
        </div>

        {!isSuccess ? (
          <>
            <h2 className="text-2xl font-bold text-[#17212B] text-center mb-2" style={{ fontFamily: "Outfit" }}>
              Set New Password
            </h2>
            <p className="text-[#667085] text-center text-sm mb-8">
              Please choose a secure new password for your Vee Power Electricals account.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100 flex items-center gap-2">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {error}
                </div>
              )}

              {(!searchParams.get("uid") || !searchParams.get("token")) && (
                <div className="space-y-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <div>
                    <label className="block text-xs font-medium text-[#475569] mb-1">UID Code</label>
                    <input
                      type="text"
                      value={uidb64}
                      onChange={(e) => setUidb64(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#D9E1E8] rounded-lg text-xs font-mono outline-none"
                      placeholder="e.g. MTI"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#475569] mb-1">Token Code</label>
                    <input
                      type="text"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#D9E1E8] rounded-lg text-xs font-mono outline-none"
                      placeholder="e.g. c39z12-..."
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-[#17212B] mb-1.5">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl focus:bg-white focus:border-[#1769AA] focus:ring-4 focus:ring-[#1769AA]/10 outline-none transition-all text-sm"
                  placeholder="Minimum 8 characters"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#17212B] mb-1.5">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl focus:bg-white focus:border-[#1769AA] focus:ring-4 focus:ring-[#1769AA]/10 outline-none transition-all text-sm"
                  placeholder="Repeat new password"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#1769AA] hover:bg-[#0B3A63] text-white font-medium py-3 rounded-xl transition-all shadow-md mt-2"
              >
                {isLoading ? "Updating Password..." : "Reset Password"}
              </button>
            </form>
          </>
        ) : (
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
            <h2 className="text-2xl font-bold text-[#17212B] mb-2" style={{ fontFamily: "Outfit" }}>
              Password Reset Complete
            </h2>
            <p className="text-[#667085] text-sm mb-8">
              Your password has been successfully updated. You can now login with your new credentials.
            </p>
            <Link
              to="/login"
              className="inline-block w-full bg-[#1769AA] hover:bg-[#0B3A63] text-white font-medium py-3 rounded-xl transition-all shadow-md"
            >
              Sign In Now
            </Link>
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
