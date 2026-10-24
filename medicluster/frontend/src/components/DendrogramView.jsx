import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { RISK_COLORS } from "../theme";

export default function DendrogramView({ linkageMatrix = [], patients = [] }) {
  const svgRef = useRef();
  const [cutHeight, setCutHeight] = useState(50); // % of max height

  const isEmpty = !linkageMatrix || linkageMatrix.length === 0;

  useEffect(() => {
    if (isEmpty) return;
    drawDendrogram(svgRef.current, linkageMatrix, patients, cutHeight);
  }, [linkageMatrix, patients, cutHeight, isEmpty]);

  return (
    <div className="panel space-y-3 fade-in">
      <p className="section-label">Dendrogram (Hierarchical Clustering)</p>

      {isEmpty ? (
        <div className="flex items-center justify-center h-48 text-slate-600 text-sm">
          Run <span className="mx-1 text-blue-600 font-mono">Hierarchical</span> clustering to see dendrogram
        </div>
      ) : (
        <>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">
              Cut height: {cutHeight}% — clusters: <span className="text-blue-600 font-mono">{estimateClusters(linkageMatrix, cutHeight)}</span>
            </label>
            <input
              type="range" min={0} max={100} step={1}
              value={cutHeight}
              onChange={(e) => setCutHeight(+e.target.value)}
              className="w-full accent-blue-600"
            />
          </div>
          <div className="overflow-x-auto">
            <svg ref={svgRef} className="w-full" />
          </div>
        </>
      )}
    </div>
  );
}

function estimateClusters(lm, cutPct) {
  if (!lm?.length) return 0;
  const maxH = lm[lm.length - 1][2];
  const cutH  = (cutPct / 100) * maxH;
  return lm.filter((row) => row[2] > cutH).length === 0 ? 1 : lm.filter((r) => r[2] > cutH).length + 1;
}

function drawDendrogram(svgEl, linkageMatrix, patients, cutPct) {
  if (!svgEl) return;
  const n = linkageMatrix.length + 1; // number of original leaves
  const maxHeight = linkageMatrix[linkageMatrix.length - 1][2];
  const cutHeight = (cutPct / 100) * maxHeight;

  const margin = { top: 20, right: 20, bottom: 40, left: 50 };
  const width  = Math.max(600, n * 8);
  const height = 320;
  const innerW = width  - margin.left - margin.right;
  const innerH = height - margin.top  - margin.bottom;

  d3.select(svgEl).selectAll("*").remove();

  const svg = d3.select(svgEl)
    .attr("width", width)
    .attr("height", height)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Build hierarchical cluster structure from scipy linkage matrix
  const nodes = Array.from({ length: 2 * n - 1 }, (_, i) => ({
    id: i, x: 0, height: i < n ? 0 : 0, children: [],
  }));

  for (let i = 0; i < linkageMatrix.length; i++) {
    const [left, right, dist] = linkageMatrix[i];
    const newId = n + i;
    nodes[newId].height   = dist;
    nodes[newId].children = [Math.round(left), Math.round(right)];
  }

  // Layout: assign x positions to leaves
  let leafX = 0;
  function assignX(nodeId) {
    const node = nodes[nodeId];
    if (!node.children.length) {
      node.x = leafX++;
    } else {
      node.children.forEach(assignX);
      node.x = node.children.reduce((sum, cid) => sum + nodes[cid].x, 0) / node.children.length;
    }
  }
  assignX(2 * n - 2); // root is always last node

  const xScale = d3.scaleLinear().domain([0, n - 1]).range([0, innerW]);
  const yScale = d3.scaleLinear().domain([0, maxHeight]).range([innerH, 0]);

  // Draw cut-line
  const cutY = yScale(cutHeight);
  svg.append("line")
    .attr("x1", 0).attr("x2", innerW)
    .attr("y1", cutY).attr("y2", cutY)
    .attr("stroke", "#ad633f")
    .attr("stroke-width", 1.5)
    .attr("stroke-dasharray", "4,3")
    .attr("opacity", 0.7);

  // Draw links
  function drawLinks(nodeId) {
    const node = nodes[nodeId];
    if (!node.children.length) return;
    const x = xScale(node.x);
    const y = yScale(node.height);
    for (const childId of node.children) {
      const child = nodes[childId];
      const cx = xScale(child.x);
      const cy = yScale(child.height);
      const color = node.height > cutHeight ? "#a19c92" : RISK_COLORS.High;
      svg.append("path")
        .attr("d", `M${x},${y} L${x},${cy} L${cx},${cy}`)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", 1.2);
      drawLinks(childId);
    }
  }
  drawLinks(2 * n - 2);

  // Y-axis
  svg.append("g")
    .call(d3.axisLeft(yScale).ticks(5).tickFormat(d3.format(".2f")))
    .selectAll("text").style("fill", "#62675e").style("font-size", "10px");

  svg.select(".domain").attr("stroke", "#bcb6a9");
  svg.selectAll(".tick line").attr("stroke", "#bcb6a9");
}
