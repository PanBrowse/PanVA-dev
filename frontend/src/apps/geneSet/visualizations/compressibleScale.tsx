import { calculateIndividualScales } from "@/helpers/axisStretch";
import { GraphNode } from "@/helpers/springSimulationUtils";
import { SequenceMetrics } from "@/types";
import * as d3 from "d3";
import { Dictionary } from "lodash";

export const createCompressionScale = (graphNodes: GraphNode[], sequences: SequenceMetrics[], windowRange:[number, number]): [newScale: Dictionary<d3.ScaleLinear<number, number, never>>, compressionFactor:number, globalEdges: [number, number]] => {
    let xScaleGeneToWindowInit:Dictionary<d3.ScaleLinear<number, number, never>> = {}
    let xScaleGeneToCompressionInit:Dictionary<d3.ScaleLinear<number, number, never>> = {}
    
    //determine global ranges'
    const sortedCompressionRangeGlobal = (graphNodes.map(d => d.position)).sort((a,b) => a-b)
    const edgesOfNewRangeGlobal: [number, number] = [sortedCompressionRangeGlobal[0],  sortedCompressionRangeGlobal[sortedCompressionRangeGlobal.length -1]]
    const oldRanges = graphNodes.map(d => d.originalPosition).sort((a,b) => a-b)
    const edgesOfOldRange = [oldRanges[0], oldRanges[oldRanges.length -1 ]]
    const overallCompressionFactor: number = (edgesOfOldRange[1] - edgesOfOldRange[0]) / (edgesOfNewRangeGlobal[1] - edgesOfNewRangeGlobal[0])
    
    sequences.forEach(sequence => {
      const key = sequence.sequence_id
      const genePositionsOnSequence = graphNodes
        .filter(d => String(d.sequenceId) === key)
        .sort(d => d.originalPosition)
  
      const [geneToCompression, scaleGeneToWindow] = calculateIndividualScales(
        genePositionsOnSequence, 
        edgesOfNewRangeGlobal, 
        windowRange
      )
      xScaleGeneToCompressionInit[key] = geneToCompression
      xScaleGeneToWindowInit[key] = scaleGeneToWindow
    })
    return [xScaleGeneToCompressionInit, overallCompressionFactor, edgesOfNewRangeGlobal]
  }

