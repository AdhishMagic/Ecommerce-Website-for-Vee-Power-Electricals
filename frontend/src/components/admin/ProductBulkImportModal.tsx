import { useState, useRef } from "react";
import {
  Upload,
  Download,
  FileSpreadsheet,
  Archive,
  AlertCircle,
  CheckCircle2,
  X,
  Loader2,
  FileText,
} from "lucide-react";
import { catalogApi } from "../../api/catalog";

interface ProductBulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface RowError {
  row: number;
  sku: string;
  reason: string;
  error?: string;
}

interface ImportSummary {
  total_processed: number;
  created_count: number;
  updated_count: number;
  error_count: number;
  errors: RowError[];
}

export default function ProductBulkImportModal({
  isOpen,
  onClose,
  onSuccess,
}: ProductBulkImportModalProps) {
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const excelInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDownloadTemplate = async () => {
    setIsDownloadingTemplate(true);
    setUploadError("");
    try {
      await catalogApi.downloadBulkImportTemplate();
    } catch (err: any) {
      console.error("Template download failed:", err);
      setUploadError(err?.message || "Failed to download Excel template.");
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const handleExcelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls") && !lower.endsWith(".csv")) {
      setUploadError("Invalid file type. Please upload an Excel (.xlsx, .xls) or CSV (.csv) file.");
      return;
    }
    setUploadError("");
    setExcelFile(file);
  };

  const handleZipChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setUploadError("Invalid archive format. Please upload a .zip archive containing images.");
      return;
    }
    setUploadError("");
    setZipFile(file);
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!excelFile) {
      setUploadError("Please select an Excel (.xlsx, .xls) or CSV file to import.");
      return;
    }

    setIsUploading(true);
    setUploadError("");
    setSummary(null);

    try {
      const res = await catalogApi.bulkImportProductsMultipart(excelFile, zipFile);
      setSummary({
        total_processed: res.total_processed || 0,
        created_count: res.created_count !== undefined ? res.created_count : res.created || 0,
        updated_count: res.updated_count !== undefined ? res.updated_count : res.updated || 0,
        error_count: res.error_count !== undefined ? res.error_count : (res.errors ? res.errors.length : 0),
        errors: res.errors || [],
      });
      // Notify parent to refresh products
      onSuccess();
    } catch (err: any) {
      console.error("Bulk import failed:", err);
      setUploadError(err?.message || "Bulk import failed. Please check your file formatting and try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownloadErrorReport = () => {
    if (!summary || summary.errors.length === 0) return;
    const header = "Row,SKU,Reason\n";
    const rows = summary.errors
      .map(e => `"${e.row}","${e.sku.replace(/"/g, '""')}","${(e.reason || e.error || '').replace(/"/g, '""')}"`)
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "bulk_import_errors.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const resetForm = () => {
    setExcelFile(null);
    setZipFile(null);
    setSummary(null);
    setUploadError("");
    if (excelInputRef.current) excelInputRef.current.value = "";
    if (zipInputRef.current) zipInputRef.current.value = "";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-modal-title"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#0A2540] text-white flex items-center justify-center shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 id="import-modal-title" className="font-bold text-[#0A2540] text-base">
                Bulk Import Products via Excel
              </h3>
              <p className="text-xs text-slate-500">
                Create new products, update existing items by SKU, and link images.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* 1. Download Template Banner Callout */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-white border border-blue-100 text-[#0A2540] shadow-2xs shrink-0">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#0A2540]">Need the formatted Excel template?</h4>
                <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                  Download our pre-built <span className="font-semibold text-slate-800">.xlsx template</span> with all 14 columns, GST rates, guidelines, and sample electrical items.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              disabled={isDownloadingTemplate}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0A2540] hover:bg-[#153e66] text-white text-xs font-bold transition-all shadow-xs shrink-0 disabled:opacity-50 cursor-pointer"
            >
              {isDownloadingTemplate ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Downloading...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Excel Template (.xlsx)</span>
                </>
              )}
            </button>
          </div>

          {/* Error Banner */}
          {uploadError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          {/* Import In-Progress State */}
          {isUploading && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <Loader2 className="w-10 h-10 text-[#0A2540] animate-spin" />
              <h4 className="font-bold text-[#0A2540] text-sm">Processing Bulk Import...</h4>
              <p className="text-xs text-slate-500 max-w-sm">
                Parsing Excel rows, validating SKU records, creating categories, and extracting images. Please do not close this window.
              </p>
            </div>
          )}

          {/* Post-Import Summary Results */}
          {!isUploading && summary && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3 text-center">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Rows</span>
                  <span className="text-lg font-bold text-slate-800">{summary.total_processed}</span>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase block">Created</span>
                  <span className="text-lg font-bold text-emerald-800">{summary.created_count}</span>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                  <span className="text-[10px] font-bold text-blue-700 uppercase block">Updated</span>
                  <span className="text-lg font-bold text-blue-800">{summary.updated_count}</span>
                </div>
                <div className={`rounded-xl p-3 border ${summary.error_count > 0 ? "bg-red-50 border-red-200 text-red-800" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
                  <span className="text-[10px] font-bold uppercase block">Errors</span>
                  <span className="text-lg font-bold">{summary.error_count}</span>
                </div>
              </div>

              {/* Error Table if errors occurred */}
              {summary.errors.length > 0 && (
                <div className="border border-red-200 rounded-xl overflow-hidden bg-white">
                  <div className="bg-red-50/70 px-4 py-2.5 border-b border-red-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-red-800 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Row-Level Validation Failures ({summary.errors.length})
                    </span>
                    <button
                      type="button"
                      onClick={handleDownloadErrorReport}
                      className="text-[11px] font-bold text-red-700 hover:text-red-900 flex items-center gap-1 underline cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      Download Error CSV
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 text-slate-500 font-semibold sticky top-0">
                        <tr>
                          <th className="px-3 py-2 border-b border-slate-200 w-16">Row #</th>
                          <th className="px-3 py-2 border-b border-slate-200 w-32">SKU</th>
                          <th className="px-3 py-2 border-b border-slate-200">Failure Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                        {summary.errors.map((err, i) => (
                          <tr key={i} className="hover:bg-red-50/30">
                            <td className="px-3 py-2 text-slate-600 font-bold">{err.row}</td>
                            <td className="px-3 py-2 text-[#0A2540]">{err.sku}</td>
                            <td className="px-3 py-2 text-red-700 font-sans">{err.reason || err.error}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Upload Form Inputs (when not in loading or summary state) */}
          {!isUploading && !summary && (
            <form onSubmit={handleImportSubmit} className="space-y-4">
              {/* File Dropzone 1: Excel File */}
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1.5 block">
                  Excel Spreadsheet File (.xlsx, .xls, .csv) <span className="text-red-500">*</span>
                </label>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  ref={excelInputRef}
                  onChange={handleExcelChange}
                  className="hidden"
                  id="excel-file-input"
                />
                <div
                  onClick={() => excelInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
                    excelFile ? "border-emerald-400 bg-emerald-50/30" : "border-slate-300 hover:border-[#0A2540] hover:bg-slate-50"
                  }`}
                >
                  <FileSpreadsheet className={`w-8 h-8 mb-2 ${excelFile ? "text-emerald-600" : "text-slate-400"}`} />
                  {excelFile ? (
                    <div>
                      <span className="text-xs font-bold text-slate-800 block truncate max-w-sm">{excelFile.name}</span>
                      <span className="text-[11px] text-slate-500">
                        {(excelFile.size / 1024).toFixed(1)} KB • Click to change file
                      </span>
                    </div>
                  ) : (
                    <div>
                      <span className="text-xs font-bold text-[#0A2540] block">Choose Excel file or drag &amp; drop</span>
                      <span className="text-[11px] text-slate-400">Supports .xlsx, .xls, and .csv formats</span>
                    </div>
                  )}
                </div>
              </div>

              {/* File Dropzone 2: Companion Images ZIP Archive */}
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1.5 block">
                  Companion Product Images Archive (.zip) <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="file"
                  accept=".zip"
                  ref={zipInputRef}
                  onChange={handleZipChange}
                  className="hidden"
                  id="zip-file-input"
                />
                <div
                  onClick={() => zipInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
                    zipFile ? "border-blue-400 bg-blue-50/30" : "border-slate-300 hover:border-[#0A2540] hover:bg-slate-50"
                  }`}
                >
                  <Archive className={`w-7 h-7 mb-1.5 ${zipFile ? "text-blue-600" : "text-slate-400"}`} />
                  {zipFile ? (
                    <div>
                      <span className="text-xs font-bold text-slate-800 block truncate max-w-sm">{zipFile.name}</span>
                      <span className="text-[11px] text-slate-500">
                        {(zipFile.size / (1024 * 1024)).toFixed(2)} MB • Click to change archive
                      </span>
                    </div>
                  ) : (
                    <div>
                      <span className="text-xs font-bold text-slate-700 block">Attach images ZIP archive</span>
                      <span className="text-[11px] text-slate-400">
                        Contains image files matching filenames in Image_Source* and Gallery_Images
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!excelFile || isUploading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-[#0A2540] hover:bg-[#153e66] text-white rounded-xl text-xs font-bold transition-all shadow-sm hover:shadow disabled:opacity-50 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload &amp; Import Products</span>
                </button>
              </div>
            </form>
          )}

          {/* Footer actions when summary is shown */}
          {!isUploading && summary && (
            <div className="pt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Import Another File
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 bg-[#0A2540] hover:bg-[#153e66] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                Close &amp; View Products
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
