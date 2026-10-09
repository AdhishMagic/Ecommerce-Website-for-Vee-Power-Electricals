export interface BenefitItem {
  icon: string;
  title: string;
  desc: string;
}

interface BenefitCardProps {
  item: BenefitItem;
}

export default function BenefitCard({ item }: BenefitCardProps) {
  return (
    <div className="bg-white border border-[#D9E1E8] rounded-2xl p-5 sm:p-6 transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-md hover:border-[#1769AA]/40 flex flex-col h-full group">
      <div className="w-12 h-12 rounded-xl bg-[#0B3A63]/5 border border-[#1769AA]/15 flex items-center justify-center text-2xl mb-4 group-hover:scale-105 group-hover:border-[#1769AA]/30 transition-transform duration-200 shrink-0">
        <span aria-hidden="true">{item.icon}</span>
      </div>
      <h3
        className="font-bold text-[#0B3A63] text-sm sm:text-base mb-1.5 transition-colors duration-200"
        style={{ fontFamily: "Outfit" }}
      >
        {item.title}
      </h3>
      <p className="text-xs sm:text-sm text-[#475467] leading-relaxed flex-1">
        {item.desc}
      </p>
    </div>
  );
}
