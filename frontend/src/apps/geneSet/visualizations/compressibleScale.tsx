import { calculateCompressionFactor, calculateIndividualScales, calculateWidth } from "@/helpers/axisStretch";
import { GraphNode } from "@/helpers/springSimulationUtils";
import { SequenceMetrics } from "@/types";
import * as d3 from "d3";
import { Dictionary } from "lodash";

export const createCompressionScale = (graphNodes: GraphNode[], sequences: SequenceMetrics[], windowRange: [number, number]): [newScale: Dictionary<d3.ScaleLinear<number, number, never>>, compressionFactor: number, globalEdges: [number, number]] => {
  let xScaleGeneToWindowInit: Dictionary<d3.ScaleLinear<number, number, never>> = {};
  let xScaleGeneToCompressionInit: Dictionary<d3.ScaleLinear<number, number, never>> = {};

  //determine global ranges'
  const sortedCompressionRangeGlobal = (graphNodes.map(d => d.startPosition)).sort((a, b) => a - b);
  const edgesOfNewRangeGlobal: [number, number] = [sortedCompressionRangeGlobal[0], sortedCompressionRangeGlobal[sortedCompressionRangeGlobal.length - 1]];
  const oldRanges = graphNodes.map(d => d.originalPosition).sort((a, b) => a - b);
  const edgesOfOldRange = [oldRanges[0], oldRanges[oldRanges.length - 1]];
  const overallCompressionFactor: number = (edgesOfOldRange[1] - edgesOfOldRange[0]) / (edgesOfNewRangeGlobal[1] - edgesOfNewRangeGlobal[0]);

  sequences.forEach(sequence => {
    const key = sequence.sequence_id;
    const genePositionsOnSequence = graphNodes
      .filter(d => String(d.sequenceId) === key)
      .sort(d => d.originalPosition);

    const [geneToCompression, scaleGeneToWindow] = calculateIndividualScales(
      genePositionsOnSequence,
      edgesOfNewRangeGlobal,
      windowRange
    );
    xScaleGeneToCompressionInit[key] = geneToCompression;
    xScaleGeneToWindowInit[key] = scaleGeneToWindow;
  });
  return [xScaleGeneToCompressionInit, overallCompressionFactor, edgesOfNewRangeGlobal];
};

// Drawsquish 
export const drawSquish = (
  currentGeneToCompressionScale: d3.ScaleLinear<number, number, never>,
  currentGeneToWindowScale: d3.ScaleLinear<number, number, never>,
  start: number,
  end: number,
  barHeight: number,
  ypos: number,
  defaultConnectionThickness: number,
  overallCompressionFactor?: number,
  windowRange?: [number, number]
) => {

  const geneWidth = end - start;
  const compressionWidth = currentGeneToCompressionScale(end) - currentGeneToCompressionScale(start);
  const geneWindowWidth = currentGeneToWindowScale(end) - currentGeneToWindowScale(start);
  if (geneWindowWidth < 0.1) { return ''; }
  const normalizationConstant = overallCompressionFactor === undefined ? 1 : 1 / overallCompressionFactor;
  const x0 = currentGeneToWindowScale(start);
  const x1controlStart = x0 + (geneWindowWidth * 3) / 7;
  const x1controlEnd = x0 + (geneWindowWidth * 4) / 7;
  const x1 = x0 + geneWindowWidth / 2;
  const x2 = x0 + geneWindowWidth;
  const x3 = x2;
  const x4 = x1;
  const x5 = x0;
  const x6 = x0;


  // gene outside window
  if (windowRange !== undefined && x0 > windowRange[1]) { return ''; }
  if (windowRange !== undefined && x2 < windowRange[0]) { return ''; }


  const y0 = ypos + barHeight / 2 - defaultConnectionThickness / 2;
  const y1 = y0 - defaultConnectionThickness;
  const y2 = y0;
  const y3 = ypos + barHeight / 2 + defaultConnectionThickness / 2;
  const y4 = y3 + defaultConnectionThickness;
  const y5 = y3;
  const y6 = y0;

  const compressionFactor = geneWidth / compressionWidth * normalizationConstant;

  const beta = Math.log2(Math.max(compressionFactor, 1)) / 10;
  if (compressionFactor < 1) {
    const yTopMod =
      y0 +
      (1 - Math.sqrt(compressionFactor)) *
      (defaultConnectionThickness * 3 / 7);
    const yBottomMod =
      y3 -
      (1 - Math.sqrt(compressionFactor)) *
      (defaultConnectionThickness * 3 / 7);

    const lineConnect = d3.line()([
      [x0, y0],
      [x1, yTopMod],
      [x2, y2],
      [x3, y3],
      [x4, yBottomMod],
      [x5, y5],
      [x6, y6],
    ]);
    return lineConnect;
  }

  const lineUpper: string =
    d3.line().curve(d3.curveBundle.beta(beta))([
      [x0, y0],
      [x1controlStart, y0],
      [x1, y1],
      [x1controlEnd, y0],
      [x2, y2],
    ]) ?? '';
  const lineConnect = d3.line()([
    [x6, y6],
    [x2, y2],
    [x3, y3],
    [x5, y5],
    [x6, y6],
  ]);
  const lineLower: string =
    d3.line().curve(d3.curveBundle.beta(beta))([
      [x3, y3],
      [x1controlEnd, y3],
      [x4, y4],
      [x1controlStart, y3],
      [x5, y5],
    ]) ?? '';

  const line = lineUpper + lineLower + lineConnect;
  return line;
};
