import { useState } from "react";
import { catalogApi } from "../../api/catalog";
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2 } from "lucide-react";

interface ParsedProductRow {
  name: string;
  sku: string;
  brand: string;
  category: string;
  price: string;
  stock: string;
  valid: boolean;
  error?: string;
}

export default function ImportProducts() {
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<"upload" | "preview" | "importing" | "done">("upload");
  const [previewRows, setPreviewRows] = useState<ParsedProductRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importResults, setImportResults] = useState<{ imported: number; failed: number; errors: string[] }>({
    imported: 0,
    failed: 0,
    errors: [],
  });

  const parseFileContent = (text: string) => {
    setParseError(null);
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) {
      setParseError("The uploaded file contains no data rows. Please ensure it has a header row and at least one product row.");
      return;
    }

    // Determine delimiter (comma or tab or semicolon)
    const firstLine = lines[0];
    const delimiter = firstLine.includes("\t") ? "\t" : firstLine.includes(";") ? ";" : ",";
    const headers = firstLine.split(delimiter).map(h => h.trim().toLowerCase().replace(/['"]/g, ''));

    const nameIdx = headers.findIndex(h => h.includes("name") || h.includes("product"));
    const skuIdx = headers.findIndex(h => h.includes("sku") || h.includes("code"));
    const brandIdx = headers.findIndex(h => h.includes("brand"));
    const catIdx = headers.findIndex(h => h.includes("category"));
    const priceIdx = headers.findIndex(h => h.includes("price") || h.includes("mrp") || h.includes("rate"));
    const stockIdx = headers.findIndex(h => h.includes("stock") || h.includes("qty") || h.includes("quantity"));

    const rows: ParsedProductRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const rawCols = lines[i].split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
      if (rawCols.length === 0 || (rawCols.length === 1 && !rawCols[0])) continue;

      const name = nameIdx !== -1 ? rawCols[nameIdx] || "" : rawCols[0] || "";
      const sku = skuIdx !== -1 ? rawCols[skuIdx] || "" : rawCols[1] || "";
      const brand = brandIdx !== -1 ? rawCols[brandIdx] || "" : rawCols[2] || "Standard";
      const category = catIdx !== -1 ? rawCols[catIdx] || "" : rawCols[3] || "General";
      const price = priceIdx !== -1 ? rawCols[priceIdx] || "" : rawCols[4] || "";
      const stock = stockIdx !== -1 ? rawCols[stockIdx] || "" : rawCols[5] || "0";

      const numPrice = parseFloat(price);
      const numStock = parseInt(stock, 10);

      const isValid = !!name && !!sku && !isNaN(numPrice) && numPrice >= 0 && !isNaN(numStock) && numStock >= 0;
      let rowError = "";
      if (!name) rowError = "Missing Product Name";
      else if (!sku) rowError = "Missing SKU";
      else if (isNaN(numPrice) || numPrice < 0) rowError = "Invalid Price";
      else if (isNaN(numStock) || numStock < 0) rowError = "Invalid Stock";

      rows.push({
        name,
        sku,
        brand,
        category,
        price,
        stock,
        valid: isValid,
        error: rowError,
      });
    }

    if (rows.length === 0) {
      setParseError("Could not extract any product rows from file.");
      return;
    }

    setPreviewRows(rows);
    setStage("preview");
  };

  const processFile = (f: File) => {
    setFile(f);
    setParseError(null);

    // Read file text
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content === "string") {
        parseFileContent(content);
      } else {
        setParseError("Failed to read file content. Please upload a standard CSV or spreadsheet export.");
      }
    };
    reader.onerror = () => {
      setParseError("Error reading file.");
    };
    reader.readAsText(f);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) processFile(f);
  };

  const validCount = previewRows.filter(r => r.valid).length;
  const invalidCount = previewRows.filter(r => !r.valid).length;

  const handleConfirmImport = async () => {
    const validRows = previewRows.filter(r => r.valid);
    if (validRows.length === 0) return;

    setStage("importing");
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (const row of validRows) {
      try {
        await catalogApi.createProduct({
          name: row.name,
          sku: row.sku,
          brand: row.brand,
          category: row.category,
          price: parseFloat(row.price),
          mrp: parseFloat(row.price),
          stock: parseInt(row.stock, 10),
          active: true,
        });
        successCount++;
      } catch (err: any) {
        failCount++;
        errors.push(`${row.sku}: ${err?.message || "Failed to create"}`);
      }
    }

    setImportResults({
      imported: successCount,
      failed: failCount + invalidCount,
      errors,
    });
    setStage("done");
  };

  const downloadSampleTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8,Name,SKU,Brand,Category,Price,Stock\n" +
      "Havells Ambrose Ceiling Fan,HVL-CF-AMB-1200,Havells,Fans,2450,25\n" +
      "Polycab 2.5 Sq.mm Wire 90m,POL-HW-2.5-90,Polycab,Wires & Cables,3100,40\n" +
      "Anchor Roma 16A 1-Way Switch,ANC-RM-16A,Anchor,Switches,95,120\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "vee_products_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (stage === "done") {
    return (
      <div className="max-w-xl mx-auto text-center py-16">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-600">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-[#0B3A63] mb-2">Import Processing Complete!</h2>
        <p className="text-[#667085]">
          {importResults.imported} products imported successfully to the catalog.
          {importResults.failed > 0 && ` (${importResults.failed} rows rejected/invalid).`}
        </p>

        {importResults.errors.length > 0 && (
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-left text-xs text-amber-800 max-h-40 overflow-y-auto">
            <p className="font-bold mb-1">Row processing notices:</p>
            {importResults.errors.map((e, idx) => (
              <p key={idx} className="font-mono">{e}</p>
            ))}
          </div>
        )}

        <button 
          onClick={() => { setStage("upload"); setFile(null); setPreviewRows([]); }} 
          className="mt-6 bg-[#0B3A63] text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#1769AA] transition-colors"
        >
          Import More Products
        </button>
      </div>
    );
  }

  if (stage === "importing") {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <Loader2 className="w-12 h-12 text-[#0B3A63] animate-spin mx-auto mb-4" />
        <h2 className="text-xl font-bold text-[#0B3A63] mb-2">Importing Products...</h2>
        <p className="text-slate-500 text-sm">Persisting valid items into Vee Power catalog database.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#0B3A63]">Import Products</h1>
        <p className="text-sm text-[#667085]">Bulk import products from CSV spreadsheet into catalog</p>
      </div>

      {parseError && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{parseError}</span>
        </div>
      )}

      {stage === "upload" && (
        <div className="space-y-5">
          {/* Template download */}
          <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl p-5 flex items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-[#1769AA] mb-1">📄 Download Import Template</h3>
              <p className="text-sm text-[#667085]">Use our CSV template to ensure correct column formatting. Required: Name, SKU, Brand, Category, Price, Stock.</p>
            </div>
            <button 
              onClick={downloadSampleTemplate}
              className="flex-shrink-0 bg-[#1769AA] text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-[#0B3A63] transition-colors"
            >
              Download Template
            </button>
          </div>

          {/* Drop zone */}
          <div
            className="border-2 border-dashed border-[#D9E1E8] rounded-xl p-14 text-center hover:border-[#1769AA] transition-colors cursor-pointer"
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
          >
            <div className="text-5xl mb-4">
              <FileSpreadsheet className="w-16 h-16 text-[#0B3A63] mx-auto" />
            </div>
            <h3 className="font-bold text-[#0B3A63] text-lg mb-2">Drop your CSV / spreadsheet file here</h3>
            <p className="text-sm text-[#667085] mb-5">Supports standard CSV format with comma or tab delimited values.</p>
            <label className="cursor-pointer bg-[#0B3A63] hover:bg-[#1769AA] text-white font-medium px-6 py-3 rounded-lg transition-colors inline-block">
              Choose File
              <input type="file" accept=".csv,.txt" className="hidden" onChange={handleFileChange} />
            </label>
          </div>

          {/* Instructions */}
          <div className="bg-white border border-[#D9E1E8] rounded-xl p-5">
            <h3 className="font-semibold text-[#0B3A63] mb-3">Import Instructions</h3>
            <ol className="space-y-2 text-sm text-[#667085] list-decimal list-inside">
              <li>Download the CSV template above and fill in your product data</li>
              <li>Required columns: Name, SKU, Brand, Category, Price, Stock</li>
              <li>Upload the completed file using the dropzone above</li>
              <li>Review the real-time preview table and confirm import into the live backend catalog</li>
            </ol>
          </div>
        </div>
      )}

      {stage === "preview" && (
        <div className="space-y-5">
          {/* File info */}
          <div className="bg-white border border-[#D9E1E8] rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-8 h-8 text-[#0B3A63]" />
              <div>
                <p className="font-semibold text-[#17212B]">{file?.name || "products.csv"}</p>
                <p className="text-sm text-[#667085]">{previewRows.length} rows parsed</p>
              </div>
            </div>
            <button onClick={() => { setStage("upload"); setFile(null); setPreviewRows([]); }} className="text-sm text-[#667085] hover:text-[#C0392B]">
              Remove file
            </button>
          </div>

          {/* Validation summary */}
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="bg-white border border-[#D9E1E8] rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-[#17212B]">{previewRows.length}</p>
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
              <h3 className="font-semibold text-[#0B3A63]">Parsed Import Preview</h3>
              <p className="text-xs text-[#667085]">Showing {previewRows.length} of {previewRows.length} rows</p>
            </div>
            <div className="overflow-x-auto max-h-[400px]">
              <table className="w-full">
                <thead className="bg-[#F6F8FA] sticky top-0">
                  <tr>
                    {["Status", "Product Name", "SKU", "Brand", "Category", "Price", "Stock"].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-[#667085] px-4 py-3 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D9E1E8]">
                  {previewRows.map((row, i) => (
                    <tr key={i} className={`${row.valid ? "hover:bg-[#F6F8FA]" : "bg-[#FEF2F2]"} transition-colors`}>
                      <td className="px-4 py-3">
                        {row.valid ? (
                          <span className="text-xs font-semibold text-[#12773D] bg-[#ECFDF5] px-2 py-0.5 rounded-full">✓ Valid</span>
                        ) : (
                          <span className="text-xs font-semibold text-[#C0392B] bg-[#FEF2F2] px-2 py-0.5 rounded-full" title={row.error}>
                            ✕ {row.error || "Invalid"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#17212B]">{row.name || <span className="text-[#C0392B] italic">Missing name</span>}</td>
                      <td className="px-4 py-3 text-xs font-mono text-[#667085]">{row.sku || <span className="text-[#C0392B] italic">Missing SKU</span>}</td>
                      <td className="px-4 py-3 text-sm text-[#667085]">{row.brand}</td>
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
            <button 
              onClick={handleConfirmImport} 
              disabled={validCount === 0}
              className="flex-1 bg-[#0B3A63] hover:bg-[#1769AA] text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Confirm Import ({validCount} products)
            </button>
            <button 
              onClick={() => { setStage("upload"); setFile(null); setPreviewRows([]); }} 
              className="px-5 py-3 border border-[#D9E1E8] rounded-lg text-sm text-[#667085] hover:text-[#17212B]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
