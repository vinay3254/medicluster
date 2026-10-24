import { useCallback, useRef, useState } from "react";
import { loadSampleDataset } from "../data/sampleDataset";
import { Section } from "./ui";
import { uploadDataset } from "../api/apiClient";



export default function UploadPanel({ onDatasetLoaded, initialDataset = null }) {
  const [dragging,  setDragging]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [dataset,   setDataset]   = useState(initialDataset);
  const inputRef = useRef();

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setError(null);
    setLoading(true);
    try {
      const result = await uploadDataset(file);
      setDataset(result);
      onDatasetLoaded?.(result);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  }, [onDatasetLoaded]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const handleSampleLoad = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await loadSampleDataset();
      setDataset(result);
      onDatasetLoaded?.(result);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Section title="Dataset" className="mc-dataset-card">
      {!dataset ? (
        <div className="flex flex-col gap-3 pt-3">
          <div
            role="button"
            tabIndex={0}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), inputRef.current?.click())}
            className={`border border-dashed px-4 py-6 text-center cursor-pointer ${ dragging ? "border-ink bg-sunken" : "border-line-strong hover:bg-sunken" }`}
          >
            <input ref={inputRef} type="file" accept=".csv" className="hidden"
              onChange={(e) => handleFile(e.target.files[0])} />
            {loading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="spinner w-5 h-5" />
                <p className="text-xs text-slate-500">Processing…</p>
              </div>
            ) : (
              <>
                <p className="text-[13px]">Drop a <span className="font-mono">.csv</span> file</p>
                <p className="text-xs text-slate-500 mt-0.5">or click to browse</p>
              </>
            )}
          </div>
          {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
          <button type="button" onClick={handleSampleLoad} disabled={loading} className="btn-secondary w-full text-[13px] h-9">
            Use sample dataset
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1 py-3 border-b border-line">
          <p className="font-mono text-[13px] truncate" title={dataset.name}>{dataset.name}</p>
          <p className="text-xs text-slate-500">
            {dataset.rowCount?.toLocaleString()} rows · {dataset.featureNames?.length ?? 0} features
          </p>
          <button type="button" onClick={() => setDataset(null)}
            className="self-start mt-1 text-xs text-blue-600 underline underline-offset-2 hover:text-ink">
            Change dataset
          </button>
        </div>
      )}
    </Section>
  );
}
