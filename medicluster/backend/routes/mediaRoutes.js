const express = require("express");
const multer = require("multer");
const { createId, isValidId } = require("../db/ids");
const mediaStorage = require("../services/mediaStorage");
const axios = require("axios");
const { execFile } = require("child_process");
const path = require("path");
const PatientMedia = require("../models/PatientMedia");
const SystemConfig = require("../models/SystemConfig");
const brainMri = require("../services/brainMri");
const { requireAuth } = require("../middleware/auth");
const {
  chatText,
  chatVision,
  messagesCreate,
  ollamaConfigured,
  OllamaUnavailableError,
} = require("../utils/ollamaClient");

const ML_ENGINE_URL = process.env.ML_ENGINE_URL || "http://localhost:8080";
const IMAGING_ENGINE_URL = process.env.CHEST_IMAGING_URL || ML_ENGINE_URL;
const { DETECTOR_ID, validateLocalization } = require("../services/chestLocalization");

const router = express.Router();

function getNearbyHospitals(city, disease) {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, "../utils/search_hospitals.py");
    execFile("python", [scriptPath, city, disease || ""], (err, stdout, stderr) => {
      if (err) {
        console.error("Search hospitals script failed:", err.message);
        resolve([]);
        return;
      }
      try {
        const data = JSON.parse(stdout);
        resolve(data);
      } catch (parseErr) {
        resolve([]);
      }
    });
  });
}

async function enrichReplyWithHospitals(reply, location, options = {}) {
  const { isFollowUp = false, question = "" } = options;
  // If it's an ongoing conversational turn and the user did not ask about hospitals/doctors,
  // do not inject repetitive hospital boilerplate into the chat dialogue.
  const askedForFacilities = /\b(hospital|clinic|doctor|specialist|where to go|nearby|consultation|emergency|center|facility)\b/i.test(question || "");
  if (isFollowUp && !askedForFacilities) {
    return reply;
  }

  let locationQuery = "Bengaluru";
  let displayLocation = "Bengaluru";

  if (location && location.latitude && location.longitude) {
    locationQuery = `${location.latitude},${location.longitude}`;
    displayLocation = "your shared location";
  } else {
    try {
      const geoRes = await axios.get("http://ip-api.com/json", { timeout: 3000 });
      if (geoRes.data && geoRes.data.city) {
        locationQuery = geoRes.data.city;
        displayLocation = geoRes.data.city;
      }
    } catch (geoErr) {
      console.error("IP geolocation failed, using default:", geoErr.message);
    }
  }

  let diseaseName = "";
  const specialistMatch = reply.match(/###\s*Recommended Specialist\s*\n+([^\n#]+)/i);
  if (specialistMatch && specialistMatch[1]) {
    diseaseName = specialistMatch[1].replace(/[^a-zA-Z\s]/g, "").trim().split(/\s+/).slice(0, 3).join(" ");
  } else {
    try {
      const extractionPrompt = `From the following medical assistant response, extract the single most relevant medical department or disease category (e.g. Pulmonology, Oncology, Neurology, Cardiology, Orthopedics, Gastroenterology). Reply with ONLY the category/department name (1-2 words maximum), and absolutely nothing else.

Response:
${reply}`;
      console.log("Extracting medical department/disease category using LLM...");
      const extractRes = await chatText(extractionPrompt, { maxTokens: 15 });
      if (extractRes && extractRes.reply) {
        diseaseName = extractRes.reply.trim().replace(/[^a-zA-Z\s]/g, "");
      }
    } catch (extractErr) {
      console.error("Failed to extract medical department:", extractErr.message);
    }
  }

  console.log(`Searching hospitals near ${locationQuery} for department: ${diseaseName || "general"}`);
  const hospitals = await getNearbyHospitals(locationQuery, diseaseName);

  if (!hospitals || hospitals.length === 0) {
    // If no live facility links were found, do not append an empty generic bullet
    return reply;
  }

  const hospitalText = hospitals.map(h => `- [${h.title}](${h.href}): ${h.body}`).join("\n");
  const section5Regex = /(5\.\s*\*\*Which hospital to go nearby\*\*\s*:?)([\s\S]*)$/i;
  const specialistRegex = /(###\s*Recommended Specialist[\s\S]*)$/i;

  if (section5Regex.test(reply)) {
    return reply.replace(section5Regex, `$1\n\nNearby options near ${displayLocation}:\n${hospitalText}`);
  }
  if (specialistRegex.test(reply)) {
    return reply + `\n\n**Nearby Facilities (${displayLocation}):**\n${hospitalText}`;
  }
  return reply + `\n\n### Nearby Medical Facilities (${displayLocation}):\n${hospitalText}`;
}

const ALLOWED_MIMETYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/tiff",
  "application/dicom",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

const DICOM_EXTENSIONS = new Set([".dcm", ".dicom"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = "." + file.originalname.split(".").pop().toLowerCase();
    const isDicom = DICOM_EXTENSIONS.has(ext);
    if (!ALLOWED_MIMETYPES.has(file.mimetype) && !isDicom) {
      const err = new Error("Supported: images (JPEG/PNG/GIF/WebP), DICOM (.dcm), documents (PDF/DOC/DOCX/TXT)");
      err.status = 415;
      cb(err);
      return;
    }
    cb(null, true);
  },
});

function getFileType(mimetype, originalname = "") {
  const ext = "." + originalname.split(".").pop().toLowerCase();
  if (mimetype.startsWith("image/") || DICOM_EXTENSIONS.has(ext)) return "image";
  return "document";
}

// GET /api/media/models — proxy model list from ML engine
router.get("/models", async (_req, res, next) => {
  const brainModels = process.env.BRAIN_MRI_URL ? [brainMri.MODEL] : [];
  try {
    const r = await axios.get(`${IMAGING_ENGINE_URL}/models`, { timeout: 5000 });
    const mlModels = Array.isArray(r.data?.models) ? r.data.models : [];
    const mlDefault = r.data?.default;

    // Probe Ollama in the background for the vision model list. We don't await
    // it on the hot path because /models is loaded by the UI; the UI will fall
    // back to its own copy if this returns empty. We do, however, always include
    // the Ollama vision entry so the "claude-vision" picker still resolves to a
    // real backend handler.
    res.json({
      models: [
        ...mlModels.map(model => ({ ...model, modality: "chest-xray" })),
        ...brainModels,
        {
          id: "claude-vision",
          label: "Ollama Vision (LungLens · Claude-vision alias)",
          size: 224,
          modality: "chest-xray",
        },
      ],
      default: mlDefault || "densenet121-res224-all",
    });
  } catch {
    res.json({
      models: [
        { id: "densenet121-res224-all", label: "DenseNet121 · All datasets", size: 224, modality: "chest-xray" },
        { id: "claude-vision", label: "Ollama Vision (LungLens)", size: 224, modality: "chest-xray" },
        ...brainModels,
      ],
      default: "densenet121-res224-all",
    });
  }
});

// POST /api/media/upload
router.post("/upload", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const { patient_id } = req.body;
    if (!patient_id) return res.status(400).json({ error: "patient_id is required" });

    const fileId = createId();
    const storageKey = mediaStorage.storageKeyFor(fileId);
    await mediaStorage.uploadObject(storageKey, req.file.buffer, req.file.mimetype);

    let media;
    try {
      media = await PatientMedia.create({
        patient_id,
        original_name: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        file_type: getFileType(req.file.mimetype, req.file.originalname),
        gridfs_id: fileId,
        storageKey,
      });
    } catch (error) {
      // Avoid leaving a clinical file behind when its metadata cannot be saved.
      try {
        await mediaStorage.deleteObject({ gridfs_id: fileId, storageKey });
      } catch (cleanupError) {
        if (cleanupError.status !== 404) throw cleanupError;
      }
      throw error;
    }

    res.status(201).json(media);
  } catch (err) {
    next(err);
  }
});

// GET /api/media/file/:fileId  — stream file content (must be before /:patientId)
router.get("/file/:fileId", async (req, res, next) => {
  try {
    if (!isValidId(req.params.fileId))
      return res.status(400).json({ error: "Invalid file ID" });

    const media = await PatientMedia.findOne({
      gridfs_id: req.params.fileId.toLowerCase(),
    });
    if (!media) return res.status(404).json({ error: "File not found" });

    const downloadStream = await mediaStorage.downloadObject(media);
    res.set("Content-Type", media.mimetype);
    res.set("Content-Disposition", `inline; filename="${encodeURIComponent(media.original_name)}"`);
    if (media.size) res.set("Content-Length", media.size);
    res.set("Cache-Control", "no-store");

    downloadStream.on("error", (error) => {
      if (res.headersSent) return res.destroy();
      res.removeHeader("Content-Length");
      res.removeHeader("Content-Disposition");
      next(error);
    });
    res.on("close", () => downloadStream.destroy());
    downloadStream.pipe(res);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/media/file/:fileId
router.delete("/file/:fileId", async (req, res, next) => {
  try {
    if (!isValidId(req.params.fileId))
      return res.status(400).json({ error: "Invalid file ID" });

    const media = await PatientMedia.findOne({
      gridfs_id: req.params.fileId.toLowerCase(),
    });
    if (!media) return res.status(404).json({ error: "File not found" });

    await mediaStorage.deleteObject(media);
    await media.deleteOne();

    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/media/preview/:fileId — decoded DICOM preview with source aspect ratio.
router.get("/preview/:fileId", async (req, res, next) => {
  try {
    if (!isValidId(req.params.fileId)) return res.status(400).json({ error: "Invalid file ID" });
    const media = await PatientMedia.findOne({ gridfs_id: req.params.fileId.toLowerCase() });
    if (!media) return res.status(404).json({ error: "File not found" });
    if (media.file_type !== "image") return res.status(400).json({ error: "Image preview required" });
    const bytes = await mediaStorage.readObject(media);
    const response = await axios.post(`${IMAGING_ENGINE_URL}/preview-image`, {
      image_b64: bytes.toString("base64"), filename: media.original_name,
    }, { timeout: 60_000, responseType: "arraybuffer" });
    if (!(response.headers['content-type'] || '').startsWith('image/png')) {
      return res.status(502).json({ error: "Invalid image preview response" });
    }
    res.set('Cache-Control', 'no-store').type('png').send(Buffer.from(response.data));
  } catch (error) {
    if (error.isAxiosError) return res.status(error.response?.status === 422 ? 422 : 503).json({ error: "Image preview is unavailable" });
    next(error);
  }
});

// POST /api/media/analyze/:fileId  — run DL analysis on an image (must be before /:patientId)
router.post("/analyze/:fileId", async (req, res, next) => {
  try {
    if (!isValidId(req.params.fileId))
      return res.status(400).json({ error: "Invalid file ID" });

    const media = await PatientMedia.findOne({
      gridfs_id: req.params.fileId.toLowerCase(),
    });
    if (!media) return res.status(404).json({ error: "File not found" });
    if (media.file_type !== "image")
      return res.status(400).json({ error: "Only images can be analyzed" });

    const imageBytes = await mediaStorage.readObject(media);

    const model_name = req.body.model_name || "densenet121-res224-all";

    let analysis;

    if (model_name === brainMri.MODEL_ID) {
      analysis = await brainMri.analyzeBrainMri(imageBytes, media.original_name, media.mimetype);
    } else if (model_name === "claude-vision") {
      // ── Ollama vision analysis (was: Claude Vision) ─────────────────────────
      if (!ollamaConfigured()) return res.status(500).json({ error: "Ollama is not configured. Set OLLAMA_URL and (for cloud) OLLAMA_API_KEY." });

      const SUPPORTED = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
      const mediaType = SUPPORTED.has(media.mimetype) ? media.mimetype : "image/jpeg";

      const prompt = `You are a medical imaging AI. Analyze this medical image and return a JSON object with this exact structure — no extra text, no markdown fences, only the raw JSON:

{
  "findings": [
    {
      "label": "<condition name>",
      "confidence": <0.0–1.0 float>,
      "severity": "<high|moderate|low>",
      "cause": "<one sentence cause>",
      "medications": ["<med1>", "<med2>"],
      "prevention": ["<step1>", "<step2>"]
    }
  ],
  "scan_warning": "<string if image does not look like a medical scan, else null>"
}

Rules:
- List every visible pathology or finding with confidence >= 0.15.
- confidence must be a float between 0 and 1 (e.g. 0.87 means 87%).
- severity must be exactly one of: high, moderate, low.
- Include at least 2 medications and 2 prevention steps per finding.
- If no abnormality is found, return an empty findings array.
- Return ONLY the raw JSON object. No explanation text outside the JSON.`;

      let parsed;
      try {
        const { reply } = await chatVision({
          prompt,
          imageB64: imageBytes.toString("base64"),
          mediaType,
          maxTokens: 1500,
        });
        const raw = reply.trim();
        const jsonText = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
        parsed = JSON.parse(jsonText);
      } catch (err) {
        if (err instanceof OllamaUnavailableError) {
          return res.status(502).json({ error: "Ollama vision unavailable — please retry" });
        }
        return res.status(502).json({ error: "Ollama returned malformed JSON — please retry" });
      }

      analysis = {
        findings:     Array.isArray(parsed.findings) ? parsed.findings : [],
        model:        "ollama-vision",
        model_label:  "LungLens",
        scan_warning: parsed.scan_warning || null,
        analyzedAt:   new Date(),
      };
    } else {
      // ── ML engine (DenseNet / ResNet) analysis ─────────────────────────────
      let mlRes;
      try {
        mlRes = await axios.post(
          `${IMAGING_ENGINE_URL}/analyze-image`,
          { image_b64: imageBytes.toString("base64"), model_name, filename: media.original_name },
          { timeout: 120_000 }
        );
      } catch (error) {
        if (!error.response || error.response.status >= 500) {
          return res.status(503).json({ error: "Chest X-ray analysis is unavailable. For brain scans, select Scan type → Brain MRI and run analysis again." });
        }
        throw error;
      }

      analysis = {
        findings:     mlRes.data.findings,
        model:        mlRes.data.model,
        model_label:  mlRes.data.model_label,
        scan_warning: mlRes.data.scan_warning || null,
        modality: mlRes.data.modality || "chest-xray",
        ...(model_name === DETECTOR_ID ? { localization: validateLocalization(mlRes.data.localization, mlRes.data.findings) } : {}),
        analyzedAt:   new Date(),
      };
    }

    media.analysis = analysis;
    // A new result needs a fresh record/review decision.
    media.recordedAt = null;
    media.reviewRequestedAt = null;
    await media.save();

    res.json(analysis);
  } catch (err) {
    next(err);
  }
});

function isRecordPatient(value) {
  return typeof value === "string" && !!value.trim() && value.trim().length <= 128 && value.trim() !== "imaging-session";
}

async function analyzedMedia(fileId) {
  if (!isValidId(fileId)) throw Object.assign(new Error("Invalid file ID"), { status: 400 });
  const media = await PatientMedia.findOne({ gridfs_id: fileId.toLowerCase() });
  if (!media) throw Object.assign(new Error("File not found"), { status: 404 });
  if (media.file_type !== "image" || !media.analysis?.model || !Array.isArray(media.analysis.findings)) {
    throw Object.assign(new Error("Run image analysis before adding or flagging this result."), { status: 409 });
  }
  return media;
}

// Save a deliberate clinician record/review decision separately from the upload.
router.post("/record/:fileId", requireAuth, async (req, res, next) => {
  try {
    const media = await analyzedMedia(req.params.fileId);
    if (!isRecordPatient(req.body.patient_id)) return res.status(400).json({ error: "Enter a Patient ID to add this result to a record." });
    const patientId = req.body.patient_id.trim();
    const changedPatient = media.patient_id !== patientId;
    media.recordedAt = changedPatient || !media.recordedAt ? new Date() : media.recordedAt;
    if (changedPatient) media.reviewRequestedAt = null;
    media.patient_id = patientId;
    await media.save();
    res.json(media);
  } catch (error) { next(error); }
});

router.post("/review/:fileId", requireAuth, async (req, res, next) => {
  try {
    const media = await analyzedMedia(req.params.fileId);
    if (!isRecordPatient(media.patient_id)) return res.status(400).json({ error: "Add this result to a patient record before flagging it for review." });
    media.reviewRequestedAt ||= new Date();
    await media.save();
    res.json(media);
  } catch (error) { next(error); }
});

// POST /api/media/explain/:fileId  — clinical explanation via OmniRoute mediCluster
router.post("/explain/:fileId", async (req, res) => {
  const { findings, model_name } = req.body;

  if (!Array.isArray(findings) || findings.length === 0) {
    return res.status(400).json({ error: "findings array is required" });
  }

  const top = findings.slice(0, 5);
  const findingsList = top
    .map((f) => `${f.label} (${Math.round((f.confidence ?? 0) * 100)}% confidence)`)
    .join(", ");

  const systemPrompt = `You are a medical AI assistant.
For the given condition, respond with:
1. A brief, plain-language explanation of what the condition is.
2. General categories of how it is typically managed (e.g., "often managed with rest and monitoring," "may involve antibiotic treatment," "sometimes requires surgical evaluation") — described in broad terms only.
3. Red-flag symptoms that would warrant urgent/emergency care.
4. A clear closing statement that this is general information only, the classification may be imperfect, and a licensed physician must confirm diagnosis and determine actual treatment.`;

  const topFinding = top[0];
  let userMessage = `Identified condition: ${topFinding.label}`;
  if (typeof topFinding.confidence === "number") {
    userMessage += ` (model confidence: ${Math.round(topFinding.confidence * 100)}%)`;
  }

  // Retrieve dynamic configuration from database
  let omniRouteKey = process.env.OMNIROUTE_API_KEY || "";
  try {
    const config = await SystemConfig.findOne({ key: "omniRouteKey" });
    if (config && config.value) {
      omniRouteKey = config.value;
    }
  } catch (dbErr) {
    console.error("Failed to load omniRouteKey from database:", dbErr.message);
  }

  // 1. OmniRoute mediCluster (primary)
  try {
    console.log("Generating clinical explanation via OmniRoute mediCluster...");
    const response = await axios.post(
      "http://localhost:20128/v1/chat/completions",
      {
        model: "mediCluster",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${omniRouteKey || "YOUR_OMNIROUTE_API_KEY"}`,
          "Content-Type": "application/json"
        },
        timeout: 20000
      }
    );
    const explanation = response.data?.choices?.[0]?.message?.content;
    if (explanation) {
      return res.json({ explanation: explanation.trim() });
    }
  } catch (err) {
    console.error("OmniRoute explanation failed, trying Ollama...", err.message);
  }

  // 2. Ollama (secondary fallback)
  const scanType = model_name === brainMri.MODEL_ID ? "brain MRI" : "chest X-ray";
  const prompt = `A ${scanType} model returned the following class scores: ${findingsList}.

In plain English (2–3 short paragraphs), explain:
1. What these conditions mean and how they may be related
2. What treatment is typically recommended
3. How the patient can prevent worsening or recurrence

Be clear, concise, and avoid unnecessary medical jargon. Do not provide a specific diagnosis — this is for educational purposes only.`;

  try {
    const { reply, model } = await chatText(prompt, { maxTokens: 500 });
    if (reply) {
      return res.json({ explanation: reply, model });
    }
  } catch (err) {
    console.error("Ollama explanation failed, trying NVIDIA NIM...", err.message);
  }

  // 3. NVIDIA NIM fallback (only if key is active)
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  if (nvidiaKey && nvidiaKey.startsWith("nvapi-")) {
    try {
      console.log("Using NVIDIA NIM for clinical explanation fallback...");
      const response = await axios.post(
        "https://integrate.api.nvidia.com/v1/chat/completions",
        {
          model: "writer/palmyra-med-70b",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 500,
          temperature: 0.2
        },
        {
          headers: {
            Authorization: `Bearer ${nvidiaKey}`,
            "Content-Type": "application/json"
          },
          timeout: 25000
        }
      );
      const explanation = response.data?.choices?.[0]?.message?.content;
      if (explanation) {
        return res.json({ explanation: explanation.trim() });
      }
    } catch (err) {
      console.error("NVIDIA NIM explanation failed:", err.message);
    }
  }

  // Heuristic clinical explanation fallback
  const fallbackExplanation = `### Findings Analysis Summary\n\nThe medical scan analysis has identified: ${findingsList}.\n\n` +
    `**Clinical Overview**: Model scores are not confirmed diagnoses. A radiologist or physician must interpret the scan alongside the patient's history and examination.\n\n` +
    `**Standard Care Guidelines**: General medical response incorporates lifestyle modifications, routine physical assessments, and therapeutic interventions tailored to the specific grade of the findings.\n\n` +
    `*⚠️ Educational information only. Clinical correlation by a qualified specialist is required.*`;
  return res.json({ explanation: fallbackExplanation });
});

const LANGUAGE_NAMES = {
  en: "English",
  hi: "Hindi",
  kn: "Kannada",
  te: "Telugu",
  ta: "Tamil",
};

// POST /api/media/ai-chat  — Ollama vision chat (direct base64)
router.post("/ai-chat", async (req, res, next) => {
  try {
    const {
      images = [],
      imageBase64,
      mediaType,
      chatHistory = [],
      question = "",
      language = "en",
      location
    } = req.body;

    const SUPPORTED = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

    // Aggregate all provided images (supports multiple images or single imageBase64)
    const imagesList = [];
    if (Array.isArray(images) && images.length > 0) {
      for (const img of images) {
        if (img && img.base64) {
          const mime = SUPPORTED.has(img.mediaType) ? img.mediaType : "image/jpeg";
          imagesList.push({ base64: img.base64, mediaType: mime, name: img.name });
        }
      }
    } else if (imageBase64) {
      const mime = SUPPORTED.has(mediaType) ? mediaType : "image/jpeg";
      imagesList.push({ base64: imageBase64, mediaType: mime });
    }

    if (imagesList.length === 0 && !question.trim()) {
      return res.status(400).json({ error: "image or question is required" });
    }

    const langName = LANGUAGE_NAMES[language] || "English";
    const langInstruction = language === "en"
      ? ""
      : `\nIMPORTANT: You MUST respond entirely in ${langName}. All section headings, explanations, and the disclaimer must be written in ${langName} script.`;

    const isFollowUp = Array.isArray(chatHistory) && chatHistory.length > 0;
    const isImage = imagesList.length > 0;

    const conversationalSystem = `You are CliniQ, an empathetic, supportive medical doctor having a normal, natural ongoing clinical consultation dialogue with a patient or clinician.
- Keep your responses concise, direct, and conversational (around 1 to 2 short paragraphs or brief bullet points). Do NOT write long essays or monologues.
- Maintain full medical continuity with previous discussion, scans, or symptoms discussed.
- Answer the user's specific question directly, explain treatments or precautions simply, and ask a relevant clinical follow-up question when appropriate.
- Clearly highlight any emergency red flags if relevant.
- You are dedicated EXCLUSIVELY to medical, clinical, and healthcare topics. If the user asks about unrelated non-medical topics (e.g. general programming, creative writing, entertainment, politics, general trivia), politely decline and state that you are specialized exclusively for medical and healthcare guidance.${langInstruction}`;

    const initialImageSystem = `You are CliniQ, an empathetic and observant clinical doctor having a normal consultation with a patient or clinician.
Analyze the provided medical image(s) and provide a concise, natural, and helpful clinical response (around 2 to 3 short paragraphs or clean bullet points maximum):
- Give your direct visual impression and most likely condition in 1-2 plain, accessible sentences.
- Outline 2-3 practical immediate steps, precautions, or home-care measures.
- Briefly mention red-flag symptoms that warrant urgent medical evaluation and the type of specialist to consult if needed.
- End with a friendly, relevant clinical follow-up question (e.g. duration, pain/itch level, or associated symptoms) to continue a normal, interactive conversation.
- Do NOT lecture or write long essays. Keep it natural, conversational, and direct.${langInstruction}
- You are dedicated EXCLUSIVELY to medical, clinical, and healthcare topics.`;

    const initialSymptomSystem = `You are CliniQ, an empathetic clinical doctor having a normal consultation conversation with a patient.
Provide a concise, direct, and supportive response (around 2 to 3 short paragraphs or clean bullet points maximum):
- Directly address their symptoms with the most likely potential causes in simple, reassuring terms.
- Provide 2-3 practical next steps, self-care measures, or what to avoid.
- Briefly highlight any red flags that require urgent medical attention and what type of specialist to consult.
- End with a friendly clinical follow-up question to help narrow down the situation (e.g., duration, fever, or severity) to continue a normal, interactive conversation.
- Do NOT lecture or write walls of text. Keep it conversational, clear, and focused.${langInstruction}
- You are dedicated EXCLUSIVELY to medical, clinical, and healthcare topics.`;

    const activeSystemPrompt = isFollowUp
      ? conversationalSystem
      : (isImage ? initialImageSystem : initialSymptomSystem);

    // Prior turns + the new question, so follow-ups answer what was actually asked.
    const transcript = [
      ...chatHistory.map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`),
      ...(question.trim() ? [`User: ${question.trim()}`] : []),
    ].join("\n\n");

    // ── Primary Path: OmniRoute Proxy (Dedicated CliniQ Chatbot Route) ───────
    let omniRouteKey = process.env.OMNIROUTE_API_KEY || "sk-83ef8c640f53be5d-74e79d-e4fe3585";
    try {
      const config = await SystemConfig.findOne({ key: "omniRouteKey" });
      if (config && config.value) {
        omniRouteKey = config.value;
      }
    } catch {}

    const omniRouteUrl = process.env.OMNIROUTE_URL || "http://localhost:20128";

    if (omniRouteKey) {
      try {
        // Prioritize Gemini 3.8 Flash model family as requested
        const candidates = [
          "agy/gemini-3.8-flash-medium",
          "agy/gemini-3.8-flash-low",
          "agy/gemini-3.8-flash-high",
          "agy/gemini-3.1-flash-lite",
          "smart",
          "best-reasoning"
        ];

        const userText = question.trim() || (isImage
          ? (imagesList.length > 1
              ? `Please analyze these ${imagesList.length} medical images. What condition or findings are visible across them, what are the causes, and what should be done?`
              : "Please analyze this medical image. What condition or finding is visible, what are the causes, and what should be done?")
          : "Please assess these symptoms and advise on possible conditions, care steps, and recommended specialist.");

        const userContent = isImage
          ? [
              { type: "text", text: userText },
              ...imagesList.map((img) => ({
                type: "image_url",
                image_url: { url: `data:${img.mediaType};base64,${img.base64}` }
              }))
            ]
          : userText;

        const messages = [
          { role: "system", content: activeSystemPrompt },
          ...chatHistory.map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content
          })),
          {
            role: "user",
            content: userContent
          }
        ];

        for (const candidateModel of candidates) {
          try {
            console.log(`[CliniQ] Routing chat via OmniRoute (${candidateModel})...`);
            const response = await axios.post(
              `${omniRouteUrl}/v1/chat/completions`,
              {
                model: candidateModel,
                messages,
                max_tokens: 1500,
                temperature: 0.2
              },
              {
                headers: {
                  Authorization: `Bearer ${omniRouteKey}`,
                  "Content-Type": "application/json"
                },
                timeout: 30000
              }
            );

            const reply = response.data?.choices?.[0]?.message?.content;
            if (reply && reply.trim()) {
              console.log(`[CliniQ] Successfully received OmniRoute response using ${candidateModel}`);
              const enrichedReply = await enrichReplyWithHospitals(reply, location, {
                isFollowUp,
                question: question.trim()
              });
              return res.json({
                reply: enrichedReply.trim(),
                model: candidateModel,
                provider: "omniroute"
              });
            }
          } catch (modelErr) {
            console.warn(`[CliniQ] OmniRoute model ${candidateModel} failed:`, modelErr.response?.data?.error?.message || modelErr.message);
          }
        }
      } catch (omniErr) {
        console.error("[CliniQ] OmniRoute service error, proceeding to fallbacks:", omniErr.message);
      }
    }

    // Text-only symptom question fallback (Ollama)
    if (!isImage) {
      try {
        const { reply } = await chatText(
          `${transcript}\n\nAssistant:`,
          { system: activeSystemPrompt, maxTokens: 1500 }
        );
        const enrichedReply = await enrichReplyWithHospitals(reply, location, {
          isFollowUp,
          question: question.trim()
        });
        return res.json({ reply: enrichedReply.trim() });
      } catch (err) {
        if (err instanceof OllamaUnavailableError) {
          return res.status(502).json({
            error: "Ollama chat unavailable — verify OLLAMA_URL is reachable and OLLAMA_API_KEY (if any) is valid.",
          });
        }
        return next(err);
      }
    }

    // Vision fallback for images (Ollama/NIM)
    try {
      const primaryImage = imagesList[0];
      const { reply, model } = await chatVision({
        prompt: `${activeSystemPrompt}\n\n${question.trim() || "Please analyze this medical image."}`,
        system: activeSystemPrompt,
        imageB64: primaryImage.base64,
        mediaType: primaryImage.mediaType,
        maxTokens: 4096,
        bypassAgentRouter: true,
        customCandidates: [{ name: process.env.OLLAMA_VISION_MODEL || "gemma4:cloud" }],
        bypassOmniRoute: true
      });
      const enrichedReply = await enrichReplyWithHospitals(reply, location, {
        isFollowUp,
        question: question.trim()
      });
      return res.json({ reply: enrichedReply.trim(), model });
    } catch (visionErr) {
      console.error("All vision fallbacks failed:", visionErr.message);
      return res.status(502).json({
        error: "All AI models are currently unavailable. Please verify connection and try again."
      });
    }
  } catch (err) {
    next(err);
  }
});

// POST /api/media/ai-assistant/:fileId  — Ollama vision AI assistant (chat)
router.post("/ai-assistant/:fileId", async (req, res, next) => {
  try {
    if (!isValidId(req.params.fileId))
      return res.status(400).json({ error: "Invalid file ID" });

    const media = await PatientMedia.findOne({
      gridfs_id: req.params.fileId.toLowerCase(),
    });
    if (!media) return res.status(404).json({ error: "File not found" });
    if (media.file_type !== "image")
      return res.status(400).json({ error: "Only images can be analyzed" });

    const SUPPORTED = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
    const mediaType = SUPPORTED.has(media.mimetype) ? media.mimetype : "image/jpeg";

    const imageB64 = (await mediaStorage.readObject(media)).toString("base64");

    const { chatHistory = [], question = "", location } = req.body;

    const systemPrompt = `You are a medical AI assistant.
When analyzing a medical image, structure your response with these exact sections:
1. **Name of the disease**: [Identify name of the condition or finding]
2. **Cause of the disease**: [Briefly explain the underlying causes]
3. **How to prevent it**: [Provide prevention steps]
4. **How to diagnose it**: [Explain diagnostic methods or tests needed]
5. **Which hospital to go nearby**: [Suggest the type of medical specialist, department, or facility to consult]`;

    const firstUserText = chatHistory.length === 0
      ? "Please analyze this medical image. Tell me what condition is visible, how to prevent it, how to treat it, and what medications are commonly used."
      : chatHistory[0].content;

    // Optional NVIDIA NIM fallback for users who still have a key configured.
    const nvidiaKey = process.env.NVIDIA_API_KEY;
    if (nvidiaKey && nvidiaKey.startsWith("nvapi-")) {
      try {
        console.log("Using NVIDIA NIM Vision API for image assistant...");
        const response = await axios.post(
          "https://integrate.api.nvidia.com/v1/chat/completions",
          {
            model: "google/gemma-4-31b-it",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: `${systemPrompt}\n\nUser Question: ${question.trim() || firstUserText}` },
                  { type: "image_url", image_url: { url: `data:${mediaType};base64,${imageB64}` } }
                ]
              }
            ],
            max_tokens: 1024,
            temperature: 0.2
          },
          { headers: { Authorization: `Bearer ${nvidiaKey}`, "Content-Type": "application/json" }, timeout: 20000 }
        );
        const reply = response.data?.choices?.[0]?.message?.content;
        if (reply) {
          console.log("Successfully generated assistant response using NVIDIA NIM!");
          const enrichedReply = await enrichReplyWithHospitals(reply, location);
          return res.json({ reply: enrichedReply.trim() });
        }
      } catch (nvidiaErr) {
        console.error("NVIDIA NIM assistant failed:", nvidiaErr.message || (nvidiaErr.response && nvidiaErr.response.data));
      }
    }

    // Primary path: Ollama (local or cloud, OLLAMA_API_KEY auth if configured).
    try {
      const { reply, model } = await chatVision({
        prompt: `${systemPrompt}\n\nUser Question: ${question.trim() || firstUserText}`,
        system: systemPrompt,
        imageB64,
        mediaType,
        maxTokens: 4096,
        bypassAgentRouter: true,
        customCandidates: [{ name: process.env.OLLAMA_VISION_MODEL || "gemma4:cloud" }],
        bypassOmniRoute: true
      });
      const enrichedReply = await enrichReplyWithHospitals(reply, location);
      return res.json({ reply: enrichedReply.trim() });
    } catch (err) {
      if (err instanceof OllamaUnavailableError) {
        console.error("Ollama assistant unavailable:", err.message);
        return res.status(502).json({
          error: "Ollama assistant unavailable — verify OLLAMA_URL is reachable and OLLAMA_API_KEY (if any) is valid.",
        });
      }
      return next(err);
    }
  } catch (err) {
    next(err);
  }
});

// POST /api/media/gradcam/:fileId  — Grad-CAM heatmap for a stored image
router.post("/gradcam/:fileId", async (req, res, next) => {
  try {
    if (!isValidId(req.params.fileId))
      return res.status(400).json({ error: "Invalid file ID" });

    const media = await PatientMedia.findOne({ gridfs_id: req.params.fileId.toLowerCase() });
    if (!media) return res.status(404).json({ error: "File not found" });

    const { model_name = "densenet121-res224-chex", target_label } = req.body;
    if (model_name === brainMri.MODEL_ID) {
      const analysis = media.analysis;
      if (analysis?.model !== brainMri.MODEL_ID) {
        return res.status(400).json({ error: "Run Brain MRI analysis before requesting its heatmap." });
      }
      return res.json({
        heatmap_data_url: analysis.heatmap_data_url || null,
        gradcam_available: !!analysis.gradcam_available,
        target_label: analysis.prediction_label,
      });
    }
    const imageB64 = (await mediaStorage.readObject(media)).toString("base64");

    const r = await axios.post(
      `${IMAGING_ENGINE_URL}/gradcam`,
      { image_b64: imageB64, model_name, target_label, filename: media.original_name },
      { timeout: 60_000 }
    );
    res.json(r.data);
  } catch (err) {
    next(err);
  }
});

// GET /api/media/:patientId  — list all files for a patient
router.get("/:patientId", async (req, res, next) => {
  try {
    const files = await PatientMedia.find({ patient_id: req.params.patientId })
      .sort({ createdAt: -1 });
    res.json(files);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
