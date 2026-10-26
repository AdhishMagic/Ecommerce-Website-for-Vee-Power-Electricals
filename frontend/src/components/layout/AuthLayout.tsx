import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import VeeElectricalsLogo from "../brand/VeeElectricalsLogo";

type AuthLayoutProps = {
  headline: string;
  headlineAccent: string;
  description: string;
  children: ReactNode;
};

export default function AuthLayout({ headline, headlineAccent, description, children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-linear-to-br from-navy via-navy-light to-electric flex items-center justify-center py-6 px-4 sm:py-10 sm:px-6 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-white/5 rounded-full blur-3xl" />
      <div className="absolute bottom-[-10%] right-[-10%] w-125 h-125 bg-amber/10 rounded-full blur-3xl" />

      <div className="grid w-full max-w-[850px] overflow-hidden rounded-2xl sm:rounded-3xl bg-white/10 shadow-2xl relative z-10 backdrop-blur-lg border border-white/20 md:grid-cols-2 my-auto">
        <div className="hidden md:flex bg-[#0B3A63]/95 p-8 lg:p-10 flex-col justify-between text-white relative">
          <div>
            <Link to="/" className="inline-block mb-8 hover:opacity-90 transition-opacity">
              <VeeElectricalsLogo variant="full" size="md" theme="white" id="auth-desktop-logo" />
            </Link>

            <h1 className="text-2xl lg:text-[28px] font-bold mb-3 leading-tight" style={{ fontFamily: "Outfit" }}>
              {headline}<br />
              <span className="text-[#F2A900]">{headlineAccent}</span>
            </h1>
            <p className="text-white/80 text-xs sm:text-sm max-w-xs leading-relaxed">
              {description}
            </p>
          </div>

          <div className="flex gap-3 items-center pt-6">
            <div className="flex -space-x-2.5">
              <img className="w-8 h-8 rounded-full border-2 border-[#0B3A63] object-cover shadow-xs" src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop" alt="User" />
              <img className="w-8 h-8 rounded-full border-2 border-[#0B3A63] object-cover shadow-xs" src="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100&h=100&fit=crop" alt="User" />
              <img className="w-8 h-8 rounded-full border-2 border-[#0B3A63] object-cover shadow-xs" src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop" alt="User" />
            </div>
            <p className="text-xs sm:text-sm text-white/80">
              Join <span className="font-semibold text-white">10,000+</span> professionals.
            </p>
          </div>
        </div>

        <div className="bg-white px-8 py-8 sm:px-10 sm:py-9 lg:px-11 lg:py-10 flex flex-col justify-center overflow-y-auto">
          <div className="mx-auto w-full max-w-[350px]">
            <div className="md:hidden mb-5">
              <Link to="/" className="inline-block">
                <VeeElectricalsLogo variant="full" size="md" theme="color" id="auth-mobile-logo" />
              </Link>
            </div>

            {children}
          </div>
        </div>
      </div>
    </div>
  );
}