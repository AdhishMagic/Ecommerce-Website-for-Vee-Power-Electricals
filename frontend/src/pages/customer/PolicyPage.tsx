import { useParams, useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { POLICIES } from "../../data/policyData";
import PolicyPageLayout from "../../components/policies/PolicyPageLayout";
import { COMPANY_NAME } from "../../constants/companyInfo";

const ALIAS_MAP: Record<string, string> = {
  // Privacy
  privacy: "privacy",
  "privacy-policy": "privacy",

  // Terms
  terms: "terms",
  "terms-and-conditions": "terms",
  "terms-conditions": "terms",

  // Shipping
  shipping: "shipping",
  "shipping-policy": "shipping",
  "delivery-policy": "shipping",
  delivery: "shipping",

  // Returns
  returns: "returns",
  "return-and-cancellation": "returns",
  "returns-and-cancellation": "returns",
  "return-cancellation": "returns",
  "return-policy": "returns",
  cancellation: "returns",
  "cancellation-policy": "returns",
  "refund-policy": "returns",
};

export default function PolicyPage() {
  const { type } = useParams<{ type?: string }>();
  const location = useLocation();

  // Extract path slug (e.g. from '/privacy' or '/:type')
  const pathSegment = (type || location.pathname.replace(/^\//, "").split("/")[0] || "").toLowerCase();
  const canonicalKey = ALIAS_MAP[pathSegment] || (POLICIES[pathSegment] ? pathSegment : "");
  const policy = POLICIES[canonicalKey];

  useEffect(() => {
    // Update document title and meta description
    if (policy) {
      document.title = `${policy.title} | ${COMPANY_NAME}`;
    } else {
      document.title = `Policies & Information | ${COMPANY_NAME}`;
    }
  }, [policy]);

  if (!policy) {
    return (
      <div className="bg-[#F6F8FA] min-h-[70vh] flex items-center justify-center py-16 px-4">
        <div className="bg-white border border-[#D9E1E8] rounded-2xl p-8 sm:p-12 max-w-lg w-full text-center shadow-xs">
          <div className="w-14 h-14 bg-amber-50 text-[#F2A900] border border-amber-200 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
            📄
          </div>
          <h1
            className="text-2xl font-bold text-[#0B3A63] mb-2"
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            Policy Page Not Found
          </h1>
          <p className="text-sm text-slate-600 mb-6 leading-relaxed">
            The policy document you requested is not available at this link. Please select one of our operational policies below:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-6 text-left">
            <Link
              to="/privacy"
              className="p-3 rounded-xl border border-slate-200 hover:border-[#1769AA] hover:bg-[#EFF6FF] text-xs font-semibold text-[#0B3A63] transition-colors"
            >
              Privacy Policy →
            </Link>
            <Link
              to="/terms"
              className="p-3 rounded-xl border border-slate-200 hover:border-[#1769AA] hover:bg-[#EFF6FF] text-xs font-semibold text-[#0B3A63] transition-colors"
            >
              Terms & Conditions →
            </Link>
            <Link
              to="/shipping"
              className="p-3 rounded-xl border border-slate-200 hover:border-[#1769AA] hover:bg-[#EFF6FF] text-xs font-semibold text-[#0B3A63] transition-colors"
            >
              Shipping Policy →
            </Link>
            <Link
              to="/returns"
              className="p-3 rounded-xl border border-slate-200 hover:border-[#1769AA] hover:bg-[#EFF6FF] text-xs font-semibold text-[#0B3A63] transition-colors"
            >
              Return & Cancellation →
            </Link>
          </div>
          <Link
            to="/"
            className="inline-flex items-center justify-center px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-[#0B3A63] hover:bg-[#1769AA] transition-colors shadow-2xs"
          >
            Return to Storefront
          </Link>
        </div>
      </div>
    );
  }

  return <PolicyPageLayout policy={policy} />;
}
