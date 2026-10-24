import { useCallback, useEffect, useRef, useState } from "react";
import {
  analyzePatientMedia, deletePatientMedia, getMediaFileUrl,
  listModels, listPatientMedia, uploadPatientMedia, explainFindings, getGradCam, addImagingToRecord, flagImagingForReview,
} from "../api/apiClient";
import { exportToPdf } from "../utils/exportPdf";
import { Page, linkCls } from "../components/ui";
import { BRAIN_CLASSES, BRAIN_MRI_MODEL_ID, CHEST_DETECTOR_MODEL_ID, acceptsImagingFile, hasImagingAnalysis, imagingSummary } from "../utils/imagingModels";

import ImagingDetectionOverlay from "../components/ImagingDetectionOverlay";
import { createAnalysisCoordinator } from "../utils/imagingAnalysis";
import "./imaging-page.css";

const ACCEPT = "image/jpeg,image/png,image/gif,image/webp,image/bmp,image/tiff,.dcm,.dicom";
const BRAIN_ACCEPT = "image/jpeg,image/png,image/webp,image/bmp,image/tiff,.dcm,.dicom";
const THRESHOLD = 0.5;
// Pathologies scored by the chest X-ray models; shown as empty rows before analysis.
const PATHOLOGIES = ["Atelectasis", "Cardiomegaly", "Consolidation", "Edema", "Effusion", "Emphysema", "Fibrosis",
  "Hernia", "Infiltration", "Mass", "Nodule", "Pleural thickening", "Pneumonia", "Pneumothorax"];

function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const isDicom = (img) => /\.(dcm|dicom)$/i.test(img?.original_name || "");

function PathologyRows({ findings, isBrain, isDetector, threshold = THRESHOLD, highlight, onHighlight }) {
  const rows = findings
    ? [...findings].sort((a, b) => b.confidence - a.confidence)
    : (isDetector ? [] : isBrain ? BRAIN_CLASSES : PATHOLOGIES).map((label) => ({ label, confidence: null }));
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / 5));
  const activePage = Math.min(page, pages - 1);
  useEffect(() => setPage(0), [findings, isBrain, isDetector]);
  return (
    <div className="imaging-pathologies flex flex-col">
      <div className="flex justify-between gap-3 pb-2 border-b border-ink eyebrow">
        <span>{isBrain ? "MRI class" : "Pathology"}</span>
        <span>{isBrain ? "Model score" : `Model score · threshold ${threshold.toFixed(2)}`}</span>
      </div>
      {!findings && isDetector && <p className="py-3 text-xs text-slate-500">Detected regions appear here after analysis.</p>}
      {rows.slice(activePage * 5, activePage * 5 + 5).map((f, index) => {
        const i = activePage * 5 + index;
        const on = f.confidence != null && (isBrain ? i === 0 : f.confidence >= threshold);
        return (
          <button type="button" disabled={!isDetector || f.confidence == null} onClick={() => onHighlight(f.label)} aria-pressed={isDetector ? highlight === f.label : undefined} key={f.label} className={`text-left grid grid-cols-[120px_minmax(0,1fr)_40px] gap-3 items-center py-1.5 border-b border-line text-[13px] ${
            f.confidence == null ? "text-slate-500" : highlight === f.label ? "font-semibold bg-orange-100/60" : on && i === 0 ? "font-semibold" : ""}`}>
            <span className="truncate" title={f.label}>{f.label}</span>
            <div className="relative h-1.5 bg-sunken">
              {f.confidence != null && <div className={`h-full ${on ? isBrain ? "bg-ink" : "bg-risk-high" : "bg-line-strong"}`} style={{ width: `${f.confidence * 100}%` }} />}
              {!isBrain && <div className="absolute -top-1 -bottom-1 w-px bg-line-strong" style={{left:`${threshold * 100}%`}} />}
            </div>
            <span className="font-mono text-right">{f.confidence == null ? "—" : f.confidence.toFixed(2)}</span>
          </button>
        );
      })}
      {pages > 1 && <div className="imaging-pagination"><button type="button" disabled={activePage === 0} onClick={() => setPage(activePage - 1)}>Previous findings</button><span>{activePage + 1} / {pages} · {rows.length} findings</span><button type="button" disabled={activePage === pages - 1} onClick={() => setPage(activePage + 1)}>Next findings</button></div>}
    </div>
  );
}

function PagedText({ text }) {
  const [page, setPage] = useState(0);
  const chunks = text.match(/[\s\S]{1,320}(?:\s|$)|[\s\S]{1,320}/g) || [text];
  const active = Math.min(page, chunks.length - 1);
  useEffect(() => setPage(0), [text]);
  return <div className="imaging-explanation"><p>{chunks[active]}</p>{chunks.length > 1 && <div className="imaging-pagination"><button disabled={!active} onClick={() => setPage(active - 1)}>Previous text</button><span>{active + 1} / {chunks.length}</span><button disabled={active === chunks.length - 1} onClick={() => setPage(active + 1)}>Next text</button></div>}</div>;
}

export default function ImagingPage() {
  const [resultTab, setResultTab] = useState("summary");
  const [mobileView, setMobileView] = useState("image");
  const [imagePage, setImagePage] = useState(0);
  const [toolbarTab, setToolbarTab] = useState("study");
  const [patientId, setPatientId]   = useState("");
  const [images, setImages]         = useState([]);
  const [models, setModels]         = useState([]);
  const [scanType, setScanType] = useState("chest-xray");
  const [selectedModel, setSelectedModel] = useState(CHEST_DETECTOR_MODEL_ID);
  const [dragOver, setDragOver]     = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [analyzingIds, setAnalyzingIds] = useState(new Set());
  const [error, setError]           = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [explain, setExplain]       = useState({});   // fileId → { text | error | loading }
  const [heatmaps, setHeatmaps]     = useState({});   // fileId → { url | error | loading }
  const [loadingList, setLoadingList] = useState(false);
  const inputRef = useRef();
  const explicitSelection = useRef(false);
  const [analysisStates, setAnalysisStates] = useState({});
  const [highlight, setHighlight] = useState(null);
  const [showRegions, setShowRegions] = useState(true);
  const [previewError, setPreviewError] = useState(false);
  const [recordActions, setRecordActions] = useState({});
  const analysisEpoch = useRef(new Map());
  const coordinator = useRef(null);
  if (!coordinator.current) coordinator.current = createAnalysisCoordinator({
    execute: analyzePatientMedia,
    onPending: (id, model) => {
      analysisEpoch.current.set(id,(analysisEpoch.current.get(id)||0)+1);
      setAnalyzingIds(prev => new Set(prev).add(id));
      setAnalysisStates(prev => ({...prev,[id]:{model,status:'pending'}}));
      setExplain(prev => {const next={...prev};delete next[id];return next;});
      setHeatmaps(prev => {const next={...prev};delete next[id];return next;});
    },
    onSuccess: (id, model, analysis) => {
      setImages(prev => prev.map(image => image.gridfs_id === id ? {...image,analysis} : image));
      setAnalysisStates(prev => ({...prev,[id]:{model,status:'complete'}}));
    },
    onError: (id, model, failure) => setAnalysisStates(prev => ({...prev,[id]:{model,status:'failed',error:failure?.response?.data?.error || 'Analysis unavailable. Check the model service and retry.'}})),
    onFinish: id => setAnalyzingIds(prev => {const next=new Set(prev);next.delete(id);return next;}),
  });

  useEffect(() => {
    listModels()
      .then((data) => {
        setModels(data.models ?? []);
        if (!explicitSelection.current) setSelectedModel(data.default ?? CHEST_DETECTOR_MODEL_ID);
      })
      .catch(() => setError("Model list unavailable. The default chest detector remains selected; retry the analysis after the service is available."));
  }, []);

  const effectivePatientId = patientId.trim() || "imaging-session";

  const handleFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList);
    if (!files.length) return;
    const invalid = files.filter((file) => !acceptsImagingFile(file, scanType));
    if (invalid.length) {
      setError(scanType === "brain-mri"
        ? "Brain MRI accepts JPEG, PNG, WebP, BMP, TIFF or single-frame MR DICOM files."
        : "Only supported image files and DICOM (.dcm) files are accepted.");
      return;
    }
    if (files.some(file => file.size > 50 * 1024 * 1024)) { setError("Maximum file size is 50 MB."); return; }
    setError(null);
    setUploading(true);
    try {
      const outcomes = await Promise.allSettled(files.map((f) => uploadPatientMedia(effectivePatientId, f)));
      const results = outcomes.filter(result=>result.status==='fulfilled').map(result=>result.value);
      const failed = outcomes.filter(result=>result.status==='rejected');
      if(failed.length)setError(`${failed.length} upload(s) failed. ${failed[0].reason?.response?.data?.error || 'Please retry those files.'}`);
      if(!results.length)return;
      setImages((prev) => [...results, ...prev]);
      setSelectedId(results[0]?.gridfs_id ?? null);
      setImagePage(0);
      setHighlight(null);
      for (const image of results) coordinator.current.request(image.gridfs_id, selectedModel);
    } catch (e) {
      setError(e?.response?.data?.error || "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [effectivePatientId, scanType, selectedModel]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleAnalyze = useCallback((img, modelName) => {
    setError(null); setHighlight(null);
    return coordinator.current.request(img.gridfs_id, modelName, {force:true});
  }, []);

  const handleDelete = useCallback(async (img) => {
    try {
      await deletePatientMedia(img.gridfs_id);
      setImages((prev) => prev.filter((i) => i.gridfs_id !== img.gridfs_id));
    } catch {
      setError("Delete failed");
    }
  }, []);

  const handleLoad = useCallback(async () => {
    const pid = patientId.trim();
    if (!pid) { setError("Enter a Patient ID to load existing images."); return; }
    setError(null);
    setLoadingList(true);
    try {
      const result = await listPatientMedia(pid);
      const imgs = result.filter((f) => f.file_type === "image");
      setImages(imgs);
      setAnalysisStates(prev => Object.fromEntries(Object.entries(prev).filter(([,state]) => state.status === 'pending')));
      setHighlight(null);
      setSelectedId(imgs[0]?.gridfs_id ?? null);
      setImagePage(0);
      if (imgs[0]?.analysis?.model) {
        const selection = imagingSummary(imgs[0].analysis);
        explicitSelection.current = true;
        setScanType(selection.scanType);
        setSelectedModel(selection.model);
      }
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to load images");
    } finally {
      setLoadingList(false);
    }
  }, [patientId]);

  const current = images.find((i) => i.gridfs_id === selectedId) ?? images[0] ?? null;
  const analysisState = current ? analysisStates[current.gridfs_id] : null;
  const visibleAnalysis = analysisState?.status === 'pending' || analysisState?.status === 'failed' ? null : current?.analysis;
  const findings = hasImagingAnalysis(visibleAnalysis) ? visibleAnalysis.findings : null;
  const summary = imagingSummary(visibleAnalysis);
  const isDetector = findings ? summary.isDetector : selectedModel === CHEST_DETECTOR_MODEL_ID;
  const previewUrl = image => isDicom(image) ? `/api/media/preview/${image.gridfs_id}` : getMediaFileUrl(image.gridfs_id);
  useEffect(() => {
    if (current && !hasImagingAnalysis(current.analysis)) coordinator.current.request(current.gridfs_id, selectedModel);
  }, [current?.gridfs_id, current?.analysis, selectedModel]);
  useEffect(() => {setPreviewError(false);setHighlight(null);},[current?.gridfs_id]);
  const highlightedLabel = visibleAnalysis?.localization?.boxes?.find(box=>box.id===highlight)?.label ?? highlight;
  const top = summary.top;
  const isBrain = findings ? summary.isBrain : scanType === "brain-mri";
  const exp = current ? explain[current.gridfs_id] : null;
  const heat = current ? heatmaps[current.gridfs_id] : null;
  const modelLabel = models.find((m) => (m.id ?? m.name ?? m) === selectedModel)?.label ?? selectedModel;
  const visibleModels = models.filter(model => (model.modality || "chest-xray") === scanType);

  const changeScanType = (value) => {
    explicitSelection.current = true;
    setScanType(value);
    const first = models.find(model => (model.modality || "chest-xray") === value);
    const model = value === "brain-mri" ? first?.id || BRAIN_MRI_MODEL_ID : CHEST_DETECTOR_MODEL_ID;
    setSelectedModel(model);
    if (current) handleAnalyze(current, model);
    setError(null);
  };

  const selectImage = (image) => {
    setSelectedId(image.gridfs_id);
    setHighlight(null);
    const requestedModel = analysisStates[image.gridfs_id]?.model;
    if (requestedModel || image.analysis?.model) {
      const selection = imagingSummary(requestedModel ? {model:requestedModel,findings:[]} : image.analysis);
      explicitSelection.current = true;
      setScanType(selection.scanType);
      setSelectedModel(selection.model);
    }
  };

  const runExplain = async () => {
    const id = current.gridfs_id;
    const epoch=analysisEpoch.current.get(id);
    setExplain((e) => ({ ...e, [id]: { loading: true } }));
    try {
      const data = await explainFindings(id, findings, current.analysis.model);
      if(analysisEpoch.current.get(id)!==epoch)return;
      setExplain((e) => ({ ...e, [id]: data.explanation ? { text: data.explanation } : { error: data.error ?? "Explanation unavailable." } }));
    } catch {
      if(analysisEpoch.current.get(id)!==epoch)return;
      setExplain((e) => ({ ...e, [id]: { error: "AI explanation is temporarily unavailable." } }));
    }
  };

  const runGradCam = async () => {
    if (isDetector) return;
    const id = current.gridfs_id;
    const epoch=analysisEpoch.current.get(id);
    setHeatmaps((h) => ({ ...h, [id]: { loading: true } }));
    try {
      const data = await getGradCam(id, current.analysis.model, top.label);
      if(analysisEpoch.current.get(id)!==epoch)return;
      const url = data.heatmap_data_url || (data.heatmap_b64 ? `data:image/png;base64,${data.heatmap_b64}` : null);
      setHeatmaps((h) => ({ ...h, [id]: url ? { url } : { error: "Heatmap unavailable for this model." } }));
    } catch {
      if(analysisEpoch.current.get(id)!==epoch)return;
      setHeatmaps((h) => ({ ...h, [id]: { error: "Grad-CAM is temporarily unavailable." } }));
    }
  };

  const recordAction = current ? recordActions[current.gridfs_id] : null;
  const saveRecordDecision = async (review) => {
    const id=current.gridfs_id;
    setRecordActions(prev=>({...prev,[id]:{pending:true}}));
    try {
      const result=review ? await flagImagingForReview(id) : await addImagingToRecord(id, patientId.trim() || current.patient_id);
      setImages(prev=>prev.map(image=>image.gridfs_id===id?{...image,recordedAt:result.recordedAt,reviewRequestedAt:result.reviewRequestedAt,patient_id:result.patient_id}:image));
      setRecordActions(prev=>({...prev,[id]:{text:review?'Flagged for clinician review.':'Added to patient record.'}}));
    } catch(failure) {setRecordActions(prev=>({...prev,[id]:{error:failure?.response?.data?.error || 'Could not save the record decision. Please retry.'}}));}
  };

  const exportReport = async () => {
    // Assemble the complete report independently of screen pagination and mobile tabs.
    const report = document.createElement("div");
    report.id = "imaging-complete-report";
    Object.assign(report.style, { position: "absolute", left: "-10000px", top: "0", width: "800px", padding: "24px", background: "white", color: "#17251d", fontFamily: "sans-serif" });
    const addText = (tag, text) => { const node = document.createElement(tag); node.textContent = text; report.append(node); };
    addText("h2", `${current.original_name} · ${summary.label}`);
    addText("p", `Model: ${visibleAnalysis.model} · Patient: ${patientId.trim() || current.patient_id || "Unassigned"}`);
    const canvas = document.querySelector(".imaging-canvas")?.cloneNode(true);
    if (canvas) { Object.assign(canvas.style, { display: "flex", height: "450px", width: "752px", flex: "none" }); report.append(canvas); }
    addText("p", isDetector ? "Boxes mark model candidates; an empty result does not establish a normal scan." : "Grad-CAM shows model attention, not disease boundaries.");
    addText("h3", "All model findings");
    for (const finding of [...findings].sort((a, b) => b.confidence - a.confidence)) addText("p", `${finding.label}: ${finding.confidence.toFixed(2)}`);
    if (exp?.text) { addText("h3", "Explanation"); addText("p", exp.text); }
    addText("p", "Model output supports clinician review; it is not a diagnosis. Verify findings before clinical decisions.");
    document.body.append(report);
    try { await exportToPdf(report.id, "Imaging Analysis Report", "medicluster-imaging"); }
    finally { report.remove(); }
  };

  const fieldCls = "h-8 bg-transparent border-b border-line-strong text-ink focus:outline-none focus:border-ink";

  return (
    <Page
      className="imaging-page"
      title="Imaging"
      sub="Upload chest X-rays for automatic finding detection, or select a classifier for chest images and brain MRI slices."
      actions={findings && (
        <button type="button" className="btn-secondary h-9 text-sm"
          onClick={exportReport}>
          Export PDF
        </button>
      )}
    >
      <input ref={inputRef} type="file" accept={scanType === "brain-mri" ? BRAIN_ACCEPT : ACCEPT} multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />

      <div className="imaging-toolbar">
        <div className="imaging-toolbar-switch" role="tablist" aria-label="Imaging controls">{["study", "model"].map(tab => <button type="button" role="tab" aria-selected={toolbarTab === tab} key={tab} onClick={() => setToolbarTab(tab)}>{tab === "study" ? "Patient & files" : "Scan & model"}</button>)}</div>
        <form data-toolbar="study" data-active={toolbarTab === "study"} className="flex items-center gap-2 text-slate-600" onSubmit={(e) => { e.preventDefault(); handleLoad(); }}>
          Patient
          <input value={patientId} onChange={(e) => setPatientId(e.target.value)} placeholder="Patient ID"
            aria-label="Patient ID" className={`${fieldCls} w-32 font-mono`} />
          <button type="submit" disabled={loadingList} className={linkCls}>{loadingList ? "Loading…" : "Load"}</button>
        </form>
        <label data-toolbar="model" data-active={toolbarTab === "model"} className="flex items-center gap-2 text-slate-600">
          Scan type
          <select aria-label="Scan type" value={scanType} onChange={(event) => changeScanType(event.target.value)}
            disabled={uploading || analyzingIds.size > 0} className={fieldCls}>
            <option value="chest-xray">Chest X-ray</option>
            <option value="brain-mri" disabled={!models.some(model => model.id === BRAIN_MRI_MODEL_ID)}>Brain MRI</option>
          </select>
        </label>
        <label data-toolbar="model" data-active={toolbarTab === "model"} className="flex items-center gap-2 text-slate-600">
          Model
          <select aria-label="Imaging model" value={selectedModel} onChange={(e) => {explicitSelection.current=true;setSelectedModel(e.target.value);if(current)handleAnalyze(current,e.target.value);}} className={`${fieldCls} max-w-[260px]`}>
            {visibleModels.length === 0 && <option value={selectedModel}>{selectedModel}</option>}
            {visibleModels.map((m) => {
              const id = m.id ?? m.name ?? m;
              return <option key={id} value={id}>{m.label ?? id}</option>;
            })}
          </select>
        </label>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} data-toolbar="study" data-active={toolbarTab === "study"} className={`imaging-upload ${linkCls}`}>
          {uploading ? "Uploading…" : "Upload images"}
        </button>
      </div>

      {error && <div role="alert" className="imaging-error text-[13px] text-red-700">
        <p>{error}</p>
        {scanType === "chest-xray" && error.includes("Chest X-ray analysis is unavailable") && models.some(model => model.id === BRAIN_MRI_MODEL_ID) &&
          <button type="button" onClick={() => changeScanType("brain-mri")} className={`mt-2 ${linkCls}`}>Switch to Brain MRI</button>}
      </div>}
      {scanType === "brain-mri" && <p className="imaging-mri-note text-[13px] text-slate-600">
        Use a single brain MRI slice or single-frame MR DICOM. Model classifies glioma, meningioma, pituitary tumor or no tumor.
      </p>}

      <div className="imaging-mobile-switch" role="tablist" aria-label="Imaging view">{["image", "results"].map(view => <button type="button" role="tab" aria-selected={mobileView === view} onClick={() => setMobileView(view)} key={view}>{view === "image" ? "Image viewer" : "Analysis & record"}</button>)}</div>
      <div id="imaging-results" className="imaging-workspace" data-mobile-view={mobileView}>
        {/* ── Viewer ── */}
        <div className="imaging-viewer"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}>
          <div className="imaging-canvas relative bg-[#0e0f11] flex flex-col items-center justify-center gap-3.5 text-center">
            {!current ? (
              <>
                <div className={`absolute inset-4 border border-dashed rounded-sm pointer-events-none ${dragOver ? "border-[#e9e6df]" : "border-[#3a3d42]"}`} />
                <span className="absolute top-[26px] left-7 font-mono text-[11px] text-[#8b8e93]">NO STUDY LOADED</span>
                <span className="absolute top-[26px] right-7 font-mono text-[11px] text-[#8b8e93]">{modelLabel}</span>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#8b8e93" strokeWidth="1.3" aria-hidden="true">
                  <path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 15v4a1 1 0 001 1h14a1 1 0 001-1v-4" />
                </svg>
                <span className="font-serif text-[28px] leading-[1.15] tracking-[-0.01em] text-[#e9e6df] max-w-[360px]">
                  {scanType === "brain-mri" ? "Drop brain MRI slices or MR DICOM files" : "Drop chest X-rays or DICOM files"}
                </span>
                <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
                  className="h-9 px-[18px] rounded-[3px] bg-[#e9e6df] text-[#0e0f11] font-medium">
                  {uploading ? "Uploading…" : "Choose files"}
                </button>
                <span className="text-xs text-[#8b8e93]">
                  {scanType === "brain-mri" ? "JPEG · PNG · WebP · BMP · TIFF · MR DICOM" : "JPEG · PNG · GIF · WebP · DICOM (.dcm)"} · Max 50 MB each
                </span>
              </>
            ) : (
              <>
                <img key={current.gridfs_id} src={previewUrl(current)} alt={current.original_name} onError={()=>setPreviewError(true)} className="absolute inset-0 w-full h-full object-contain" />
                {previewError && <span role="alert" className="relative text-xs text-orange-200 bg-[#0e0f11] p-3">Image preview unavailable. Reload the study after the image service is available.</span>}
                {findings && isDetector && showRegions && !previewError && <ImagingDetectionOverlay localization={visibleAnalysis.localization} highlight={highlight} onHighlight={setHighlight}/> }
                {!isDetector && findings && heat?.url && (
                  <img src={heat.url} alt={`Grad-CAM for ${top?.label}`}
                    className={`absolute inset-0 w-full h-full object-contain ${isBrain ? "" : "mix-blend-screen opacity-70"}`} />
                )}
                <span className="absolute top-3 left-3 font-mono text-[11px] text-[#8b8e93] truncate max-w-[60%]">{current.original_name}</span>
                <span className="absolute top-3 right-3 font-mono text-[11px] text-[#8b8e93]">{formatBytes(current.size)}</span>
                {!isDetector && findings && heat?.url && <span className="absolute bottom-3 left-3 font-mono text-[11px] text-[#8b8e93]">Grad-CAM · {top?.label}</span>}
              </>
            )}
          </div>

          <div className="imaging-filmstrip">
            {images.slice(Math.min(imagePage, Math.max(0, Math.ceil(images.length / 3) - 1)) * 3, Math.min(imagePage, Math.max(0, Math.ceil(images.length / 3) - 1)) * 3 + 3).map((img) => {
              const on = img.gridfs_id === current?.gridfs_id;
              return (
                <button key={img.gridfs_id} type="button" onClick={() => selectImage(img)} aria-pressed={on}
                  className={`relative w-24 h-[72px] bg-[#0e0f11] rounded-sm overflow-hidden ${on ? "outline outline-2 outline-ink outline-offset-1" : ""}`}>
                  {<img src={previewUrl(img)} alt="" className="w-full h-full object-cover opacity-80" />}
                  <span className="absolute bottom-1 left-1 right-1 font-mono text-[10px] text-[#c9c6bf] truncate text-left">{img.original_name}</span>
                </button>
              );
            })}
            <button type="button" onClick={() => inputRef.current?.click()}
              className="w-24 h-[72px] border border-dashed border-line-strong rounded-sm text-xs text-slate-500 hover:bg-sunken">+ Add</button>
          </div>
          {images.length > 3 && <div className="imaging-pagination"><button disabled={imagePage === 0} onClick={() => setImagePage(page => page - 1)}>Previous images</button><span>{Math.min(imagePage + 1, Math.ceil(images.length / 3))} / {Math.ceil(images.length / 3)}</span><button disabled={(imagePage + 1) * 3 >= images.length} onClick={() => setImagePage(page => page + 1)}>Next images</button></div>}
          {current && (
            <button type="button" onClick={() => handleDelete(current)} className="self-start text-xs text-red-700 underline underline-offset-2">
              Remove this image
            </button>
          )}
        </div>

        {/* ── Findings ── */}
        <section className="imaging-results-panel" aria-live="polite">
          <div className="imaging-result-tabs" role="tablist" aria-label="Analysis details">{["summary", "findings", "explanation", "record"].map(tab => <button type="button" role="tab" aria-selected={resultTab === tab} onClick={() => setResultTab(tab)} key={tab}>{tab[0].toUpperCase() + tab.slice(1)}</button>)}</div>
          {resultTab === "summary" && <div className="imaging-result-body">
          <div className="flex flex-col gap-2 pt-4 border-t border-ink">
            {!current ? (
              <>
                <span className="eyebrow">Awaiting image</span>
                <span className="font-serif text-[36px] leading-[1.05] tracking-[-0.02em] text-slate-600">No findings yet</span>
                <span className="text-[13px] text-slate-600 leading-normal">
                  {isBrain ? "Each MRI slice receives four class scores. Run analysis to see the top model class and available Grad-CAM heatmap."
                    : isDetector ? "Upload an image to detect finding regions automatically. Labelled boxes are model candidates for clinician review." : `Each image is scored for ${PATHOLOGIES.length} pathologies. Classifier heatmaps show attention, not detected boundaries.`}
                </span>
              </>
            ) : !findings ? (
              <>
                <span className="eyebrow">{analysisState?.status === 'pending' ? isDetector ? 'Detecting finding regions' : 'Analyzing image' : analysisState?.status === 'failed' ? 'Analysis unavailable' : 'Awaiting automatic analysis'}</span>
                <span className="font-serif text-[36px] leading-[1.05] tracking-[-0.02em] text-slate-600">{analysisState?.status === 'pending' ? isDetector ? 'Detecting…' : 'Analyzing…' : analysisState?.status === 'failed' ? 'Please retry' : 'Preparing analysis'}</span>
                {analysisState?.error && <p role="alert" className="text-[13px] text-red-700">{analysisState.error}</p>}
                <button type="button" onClick={() => handleAnalyze(current, selectedModel)} disabled={analyzingIds.has(current.gridfs_id)}
                  className="btn-primary h-10 self-start mt-2">
                  {analyzingIds.has(current.gridfs_id) ? "Analyzing…" : "Retry analysis"}
                </button>
              </>
            ) : (
              <>
                <span className="eyebrow">{summary.caption}</span>
                <span className="font-serif text-[36px] leading-[1.05] tracking-[-0.02em]">{summary.label}</span>
                {isDetector && <p className="text-[13px] text-slate-600 leading-normal">{visibleAnalysis.localization?.source || 'Pretrained chest finding detector'} · review required. Boxes mark candidate regions; an empty result does not establish a normal scan.</p>}
                {summary.isBrain && <p className="text-[13px] text-slate-600 leading-normal">
                  Research model output; clinician review required. Grad-CAM shows model attention, not tumor boundaries.
                </p>}

                {exp?.error && <p className="text-[13px] text-red-700">{exp.error}</p>}
                {heat?.error && <p className="text-[13px] text-red-700">{heat.error}</p>}
              </>
            )}
          </div>

          </div>}
          {resultTab === "findings" && <div className="imaging-result-body"><PathologyRows findings={findings} isBrain={isBrain} isDetector={isDetector} threshold={isDetector ? visibleAnalysis?.localization?.threshold ?? .25 : THRESHOLD} highlight={highlightedLabel} onHighlight={setHighlight} />
          {findings && isDetector && <label className="flex gap-2 items-center text-xs"><input type="checkbox" checked={showRegions} onChange={event=>setShowRegions(event.target.checked)}/> Show finding regions · {visibleAnalysis.localization?.boxes?.length ?? 0} boxes</label>}

          </div>}
          {resultTab === "explanation" && <div className="imaging-result-body">{exp?.text ? <PagedText text={exp.text}/> : <p className="text-sm text-slate-600">{exp?.loading ? "Explaining…" : "Request an explanation from the Summary tab after analysis."}</p>}{exp?.error && <p role="alert">{exp.error}</p>}</div>}
          {resultTab === "summary" && findings && (
            <div className="imaging-analysis-actions flex gap-2.5 flex-wrap">
              {findings.length > 0 && !exp?.text && (
                <button type="button" onClick={() => {setResultTab("explanation");runExplain();}} disabled={exp?.loading} className="btn-primary h-10">
                  {exp?.loading ? "Explaining…" : "Explain findings"}
                </button>
              )}
              {top && !isDetector && !heat?.url && (!summary.isBrain || current.analysis.gradcam_available) && (
                <button type="button" onClick={runGradCam} disabled={heat?.loading} className="btn-secondary h-10">
                  {heat?.loading ? "Localizing…" : "Show Grad-CAM region"}
                </button>
              )}
              <button type="button" onClick={() => handleAnalyze(current, selectedModel)} disabled={analyzingIds.has(current.gridfs_id)}
                className="btn-secondary h-10">
                {analyzingIds.has(current.gridfs_id) ? "Analyzing…" : "Re-run"}
              </button>
            </div>
          )}
          {resultTab === "record" && (findings ? <div className="imaging-result-body flex flex-col gap-3 pt-4">
            <div className="flex gap-2.5 flex-wrap">
              <button type="button" className="btn-primary h-10" disabled={recordAction?.pending || !(patientId.trim() || current.patient_id && current.patient_id !== 'imaging-session')} onClick={()=>saveRecordDecision(false)}>Add to patient record</button>
              <button type="button" className="btn-secondary h-10" disabled={recordAction?.pending || !current.recordedAt} onClick={()=>saveRecordDecision(true)}>{current.reviewRequestedAt?'Review requested':'Flag for review'}</button>
            </div>
            {!patientId.trim() && (!current.patient_id || current.patient_id === 'imaging-session') && <p className="text-xs text-slate-500">Enter a Patient ID to add this result to a record.</p>}
            {recordAction?.text && <p role="status" className="text-xs text-green-700">{recordAction.text}</p>}
            {recordAction?.error && <p role="alert" className="text-xs text-red-700">{recordAction.error}</p>}
          </div> : <p className="imaging-result-body text-sm">Analyze an image to save a result or request clinician review.</p>)}
          <p className="imaging-disclaimer">Model output supports clinician review; it is not a diagnosis. Verify findings before clinical decisions.</p>
        </section>
      </div>
    </Page>
  );
}
