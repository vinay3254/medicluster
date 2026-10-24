import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/**
 * Captures a DOM element and downloads it as a styled A4 PDF.
 * @param {string} elementId  id attribute of the element to capture
 * @param {string} title      PDF header title text
 * @param {string} filename   output filename (without .pdf extension)
 */
export async function exportToPdf(elementId, title, filename) {
  const element = document.getElementById(elementId);
  if (!element) {
    alert("Export failed — results panel not found.");
    return;
  }

  try {
    const width = Math.max(element.clientWidth, element.scrollWidth);
    const height = Math.max(element.clientHeight, element.scrollHeight);
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      width,
      height,
      onclone: (_document, captured) => {
        // Expand only the export clone; the on-screen workspace stays fitted.
        captured.style.setProperty("height", `${height}px`, "important");
        captured.style.setProperty("max-height", "none", "important");
        captured.style.setProperty("flex", "none", "important");
        captured.scrollTop = 0;
        captured.scrollLeft = 0;
        for (let node = captured; node; node = node.parentElement) {
          node.style.setProperty("overflow", "visible", "important");
        }
      },
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 12;
    const contentW = pageW - margin * 2;

    // Header
    const now = new Date();
    const dateStr = now.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.text("MediCluster", margin, 14);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.text(`— ${title}`, margin + 32, 14);
    pdf.setFontSize(8);
    pdf.setTextColor(140, 140, 140);
    pdf.text(dateStr, pageW - margin, 14, { align: "right" });
    pdf.setTextColor(0, 0, 0);

    // Divider
    pdf.setDrawColor(220, 220, 220);
    pdf.line(margin, 17, pageW - margin, 17);

    // Captured image — multi-page if needed
    const imgW = contentW;
    const imgH = (canvas.height / canvas.width) * imgW;
    const startY = 21;
    const usableH = pageH - startY - margin;

    if (imgH <= usableH) {
      pdf.addImage(imgData, "PNG", margin, startY, imgW, imgH);
    } else {
      const sliceH = Math.floor((usableH / imgH) * canvas.height);
      let yOffset = 0;
      let pageNum = 0;

      while (yOffset < canvas.height) {
        if (pageNum > 0) pdf.addPage();
        const remaining = canvas.height - yOffset;
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = Math.min(sliceH, remaining);
        const ctx = slice.getContext("2d");
        ctx.drawImage(canvas, 0, yOffset, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
        const sliceData = slice.toDataURL("image/png");
        const renderedH = (slice.height / canvas.width) * imgW;
        const topY = pageNum === 0 ? startY : margin;
        pdf.addImage(sliceData, "PNG", margin, topY, imgW, renderedH);
        yOffset += sliceH;
        pageNum++;
      }
    }

    pdf.save(`${filename}-${now.toISOString().slice(0, 10)}.pdf`);
  } catch (err) {
    console.error("PDF export failed:", err);
    alert("Export failed — please try again.");
  }
}
