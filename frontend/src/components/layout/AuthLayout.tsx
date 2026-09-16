import { Link } from "react-router-dom";
import type { ReactNode } from "react";

type AuthLayoutProps = {
  headline: string;
  headlineAccent: string;
  description: string;
  children: ReactNode;
};

export default function AuthLayout({ headline, headlineAccent, description, children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-linear-to-br from-navy via-navy-light to-electric flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-white/5 rounded-full blur-3xl" />
      <div className="absolute bottom-[-10%] right-[-10%] w-125 h-125 bg-amber/10 rounded-full blur-3xl" />

      <div className="grid w-full max-w-275 overflow-hidden rounded-2xl bg-white/10 shadow-2xl relative z-10 backdrop-blur-lg border border-white/20 md:grid-cols-2 md:min-h-190 lg:h-190">
        <div className="hidden md:flex bg-navy/80 p-12 flex-col justify-between text-white relative">
          <div>
            <Link to="/" className="inline-flex items-center gap-3 mb-16 hover:opacity-80 transition-opacity">
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-amber font-bold text-2xl" style={{ fontFamily: "Outfit" }}>V</span>
              </div>
              <div>
                <div className="font-bold text-white text-xl leading-none tracking-tight" style={{ fontFamily: "Outfit" }}>
                  VEE POWER
                </div>
                <div className="text-xs text-white/70 font-medium leading-tight tracking-[0.2em] uppercase mt-1">
                  Electricals
                </div>
              </div>
            </Link>

            <h1 className="text-4xl lg:text-5xl font-bold mb-6 leading-tight" style={{ fontFamily: "Outfit" }}>
              {headline}<br />
              <span className="text-amber">{headlineAccent}</span>
            </h1>
            <p className="text-white/80 text-lg max-w-md">
              {description}
            </p>
          </div>

          <div className="flex gap-4 items-center">
            <div className="flex -space-x-4">
              <img className="w-10 h-10 rounded-full border-2 border-navy" src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop" alt="User" />
              <img className="w-10 h-10 rounded-full border-2 border-navy" src="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100&h=100&fit=crop" alt="User" />
              <img className="w-10 h-10 rounded-full border-2 border-navy" src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop" alt="User" />
            </div>
            <p className="text-sm text-white/70">
              Join <span className="font-semibold text-white">10,000+</span> professionals.
            </p>
          </div>
        </div>

        <div className="bg-white p-8 sm:p-10 lg:p-12 flex flex-col justify-center overflow-y-auto">
          <div className="mx-auto w-full max-w-105">
            <div className="md:hidden flex items-center gap-3 mb-8">
              <div className="w-10 h-10 bg-navy rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-amber font-bold text-xl" style={{ fontFamily: "Outfit" }}>V</span>
              </div>
              <div className="font-bold text-navy text-lg" style={{ fontFamily: "Outfit" }}>
                VEE POWER
              </div>
            </div>

            {children}
          </div>
        </div>
      </div>
    </div>
  );
}