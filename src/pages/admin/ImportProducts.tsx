import { useState } from "react";

const mockPreview = [
  { name: "Havells Stealth 1400mm Fan", sku: "HVL-CF-STL-1400", brand: "Havells", category: "Fans", price: "3850", stock: "15", valid: true },
  { name: "Polycab 6 Sq.mm Wire 90m", sku: "POL-HW-6-90", brand: "Polycab", category: "Wires", price: "2800", stock: "25", valid: true },
  { name: "Anchor 16A Socket", sku: "ANC-SK-16A", brand: "Anchor", category: "Switches", price: "220", stock: "80", valid: true },
  { name: "", sku: "BAD-ENTRY-001", brand: "", category: "Unknown", price: "", stock: "10", valid: false },
];

export default function ImportProducts() {
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<"upload" | "preview" | "done">("upload");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setStage("preview"); }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) { setFile(f); setStage("preview"); }
  };

  const validCount = mockPreview.filter(r => r.valid).length;
  const invalidCount = mockPreview.filter(r => !r.valid).length;

  if (stage === "done") {
    return (
      <div className="max-w-xl mx-auto text-center py-16">
        <div className="text-6xl mb-4">✅</div>
        <h2 className="text-2xl font-bold text-[#0B3A63] mb-2">Import Complete!</h2>
        <p className="text-[#667085]">{validCount} products imported successfully.</p>
        <button onClick={() => setStage("upload")} className="mt-6 bg-[#0B3A63] text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#1769AA] transition-colors">
          Import More Products
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#0B3A63]">Import Products</h1>
        <p className="text-sm text-[#667085]">Bulk import products from an Excel spreadsheet</p>
      </div>

      {stage === "upload" && (
        <div className="space-y-5">
          {/* Template download */}
          <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl p-5 flex items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-[#1769AA] mb-1">📄 Download Import Template</h3>
              <p className="text-sm text-[#667085]">Use our Excel template to ensure correct column formatting. Required columns: Name, SKU, Brand, Category, MRP, Selling Price, Stock.</p>
            </div>
            <button className="flex-shrink-0 bg-[#1769AA] text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-[#0B3A63] transition-colors">
              Download Template
            </button>
          </div>

          {/* Drop zone */}
          <div
            className="border-2 border-dashed border-[#D9E1E8] rounded-xl p-14 text-center hover:border-[#1769AA] transition-colors"
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
          >
            <div className="text-5xl mb-4">📊</div>
            <h3 className="font-bold text-[#0B3A63] text-lg mb-2">Drop your Excel file here</h3>
            <p className="text-sm text-[#667085] mb-5">Supports .xlsx and .xls files. Maximum 1000 rows per import.</p>
            <label className="cursor-pointer bg-[#0B3A63] hover:bg-[#1769AA] text-white font-medium px-6 py-3 rounded-lg transition-colors inline-block">
              Choose Excel File
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
            </label>
          </div>

          {/* Instructions */}
          <div className="bg-white border border-[#D9E1E8] rounded-xl p-5">
            <h3 className="font-semibold text-[#0B3A63] mb-3">Import Instructions</h3>
            <ol className="space-y-2 text-sm text-[#667085] list-decimal list-inside">
              <li>Download the Excel template above and fill in your product data</li>
              <li>Required fields: Product Name, SKU, Brand, Category, MRP, Selling Price</li>
              <li>Optional fields: Description, Stock Quantity, Low Stock Threshold, Specifications</li>
              <li>Upload the completed file using the dropzone above</li>
              <li>Review the preview and confirm the import</li>
            </ol>
          </div>
        </div>
      )}

      {stage === "preview" && (
        <div className="space-y-5">
          {/* File info */}
          <div className="bg-white border border-[#D9E1E8] rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">📊</span>
              <div>
                <p className="font-semibold text-[#17212B]">{file?.name || "products_import.xlsx"}</p>
                <p className="text-sm text-[#667085]">{mockPreview.length} rows found</p>
              </div>
            </div>
            <button onClick={() => setStage("upload")} className="text-sm text-[#667085] hover:text-[#C0392B]">Remove file</button>
          </div>

          {/* Validation summary */}
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="bg-white border border-[#D9E1E8] rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-[#17212B]">{mockPreview.length}</p>
              <p className="text-sm text-[#667085]">Total Rows</p>
            </div>
            <div className="bg-[#ECFDF5] border border-[#BBF7D0] rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-[#12773D]">{validCount}</p>
              <p className="text-sm text-[#12773D]">Valid Products</p>
            </div>
            <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-[#C0392B]">{invalidCount}</p>
              <p className="text-sm text-[#C0392B]">Invalid Rows</p>
            </div>
          </div>

          {/* Preview table */}
          <div className="bg-white border border-[#D9E1E8] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#D9E1E8] flex justify-between items-center">
              <h3 className="font-semibold text-[#0B3A63]">Import Preview</h3>
              <p className="text-xs text-[#667085]">Showing {mockPreview.length} of {mockPreview.length} rows</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#F6F8FA]">
                  <tr>
                    {["Status", "Product Name", "SKU", "Brand", "Category", "Price", "Stock"].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-[#667085] px-4 py-3 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D9E1E8]">
                  {mockPreview.map((row, i) => (
                    <tr key={i} className={`${row.valid ? "hover:bg-[#F6F8FA]" : "bg-[#FEF2F2]"} transition-colors`}>
                      <td className="px-4 py-3">
                        {row.valid ? (
                          <span className="text-xs font-semibold text-[#12773D] bg-[#ECFDF5] px-2 py-0.5 rounded-full">✓ Valid</span>
                        ) : (
                          <span className="text-xs font-semibold text-[#C0392B] bg-[#FEF2F2] px-2 py-0.5 rounded-full">✕ Invalid</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#17212B]">{row.name || <span className="text-[#C0392B] italic">Missing name</span>}</td>
                      <td className="px-4 py-3 text-xs font-mono text-[#667085]">{row.sku}</td>
                      <td className="px-4 py-3 text-sm text-[#667085]">{row.brand || <span className="text-[#C0392B] italic">Missing</span>}</td>
                      <td className="px-4 py-3 text-sm text-[#667085]">{row.category}</td>
                      <td className="px-4 py-3 text-sm text-[#667085]">{row.price ? `₹${row.price}` : <span className="text-[#C0392B] italic">Missing</span>}</td>
                      <td className="px-4 py-3 text-sm text-[#667085]">{row.stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStage("done")} className="flex-1 bg-[#0B3A63] hover:bg-[#1769AA] text-white font-semibold py-3 rounded-lg transition-colors">
              Confirm Import ({validCount} products)
            </button>
            <button onClick={() => setStage("upload")} className="px-5 py-3 border border-[#D9E1E8] rounded-lg text-sm text-[#667085] hover:text-[#17212B]">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
