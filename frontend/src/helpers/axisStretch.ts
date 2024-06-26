import type { Gene } from "@/apps/geneSet/interfaces/interfaces"
import type { GroupInfo, SequenceMetrics } from "@/types"
import * as d3 from 'd3'
import { round } from "lodash"
import type { GraphNode } from  "./springSimulationUtils"

export const calculateXScale = (range: number[], genes?: GroupInfo[], anchor?: number) => {
    if(genes === undefined || genes.length === 0) {
      return d3.scaleLinear().rangeRound(range).domain([-10, 10])
    }
    
    const uniquePositions: number[] = []
    const uniquePositionGenes = genes.filter(d => {
      if(uniquePositions.includes(d.gene_start_position)) {return false}

      uniquePositions.push(d.gene_start_position)
      return true
    })

    let genePositions = uniquePositionGenes.map(gene => gene.gene_start_position).sort((a,b) => a-b)
    const nGenes = uniquePositionGenes.length
    const rangeAtom =  nGenes === 0 ? 10 : round((range[1] - range[0]) / nGenes)
    const dividedRange = [...Array(nGenes)].map((d, i) => i * rangeAtom ) 
    // make sure all scales have the same end range
    dividedRange[dividedRange.length - 1] = range[1]
    
    const key = `${genes[0].genome_number}_${genes[0].sequence_number}`
    const anchorValue = anchor ?? 0
    genePositions = genePositions.map(pos => pos - anchorValue)

    return d3.scaleLinear().rangeRound(dividedRange).domain(genePositions)
  }


export const updateRangeBounds = (inputScale: d3.ScaleLinear<number, number, never>, newRangeBoundsGlobal: [number, number], referenceScale: d3.ScaleLinear<number, number, never>, assignedWindowRange?:[number, number]) => {
    if(newRangeBoundsGlobal[0] === newRangeBoundsGlobal[1]) {return inputScale}
    const compressedRange: number[] = referenceScale.range()
    const windowRange = assignedWindowRange ?? [compressedRange[0], compressedRange[compressedRange.length-1]]
    const geneDomain = referenceScale.domain()
    const newRangeGlobal = newRangeBoundsGlobal
    // find points in the new view range
    const newWindowFirstGeneIndex: number = compressedRange.findIndex(d => d > newRangeGlobal[0])
    const newWindowLastGeneIndex: number = compressedRange.findIndex(d => d > newRangeGlobal[1]) 
    const newGenesInViewCompressed = compressedRange.slice(newWindowFirstGeneIndex, newWindowLastGeneIndex)
    const newGenesInViewDomain = geneDomain.slice(newWindowFirstGeneIndex, newWindowLastGeneIndex)

    // Calculate newRange and newDomain
    const compressionToWindowScale = d3.scaleLinear().domain(newRangeGlobal).range(windowRange)
    const newRangeInViewLocal = newGenesInViewCompressed.map(d => compressionToWindowScale(d))
    const newRange: number[] = [windowRange[0], ...newRangeInViewLocal, windowRange[1]]
    const newDomain = [referenceScale.invert(newRangeGlobal[0]), ...newGenesInViewDomain, referenceScale.invert(newRangeGlobal[1])]

    return d3.scaleLinear().domain(newDomain).range(newRange)
  }


  export const filterUniquePosition = (genes: GroupInfo[]) => {
    const uniquePositions: number[] = []
    const uniquePositionGenes = genes.filter(d => {
      if(uniquePositions.includes(d.gene_start_position)) {return false}
      uniquePositions.push(d.gene_start_position)
      return true
    })
    return uniquePositionGenes
  }


  export const calculateIndividualScales = (
    sequence: SequenceMetrics, 
    allUniqueGenePositions: GraphNode[], 
    newCompressionRangeEdges: [number, number], 
    windowRangeEdges: [number, number]
  ):[d3.ScaleLinear<number, number, never>, d3.ScaleLinear<number, number, never>] => {
    const key = sequence.sequence_id
    const uniqueGenePositions = allUniqueGenePositions.filter(d => String(d.sequenceId) === key).sort(d => d.originalPosition)
    const scaleCompressionToWindow = d3.scaleLinear().domain(newCompressionRangeEdges).range(windowRangeEdges)

    const compressionRange = uniqueGenePositions.map(d => d.position )
    const geneRangeInner = uniqueGenePositions.map(d => d.originalPosition )
    const scaleGeneToCompression = d3.scaleLinear().domain(geneRangeInner).range(compressionRange)
    
    const endPointsGeneRange = [scaleGeneToCompression.invert(newCompressionRangeEdges[0]), scaleGeneToCompression.invert(newCompressionRangeEdges[1])]
    const geneRange = [endPointsGeneRange[0], ...geneRangeInner, endPointsGeneRange[1]]
    const windowRangeInner = compressionRange.map(d => scaleCompressionToWindow(d))
    const windowRange = [windowRangeEdges[0], ...windowRangeInner, windowRangeEdges[1]]
    const scaleGeneToWindow = d3.scaleLinear().domain(geneRange).range(windowRange)

    return [scaleGeneToCompression, scaleGeneToWindow]

  }

  export const calculateCompressionFactor = (geneToCompression:d3.ScaleLinear<number, number, never>, genePosition: number) => {
    const genePositionsDomain: number[] = geneToCompression.domain()
    const genePositionsCompression: number[] = geneToCompression.range()
    const currentGeneIndex: number = genePositionsDomain.findIndex(domainPoint => genePosition <= domainPoint ) 
    if(currentGeneIndex + 1 >= genePositionsDomain.length || currentGeneIndex === -1){ return 0}
    const differenceGeneCoordinates = genePositionsDomain[currentGeneIndex + 1] - genePositionsDomain[currentGeneIndex]
    const differenceCompressionCoordinates = genePositionsCompression[currentGeneIndex + 1] - genePositionsCompression[currentGeneIndex]
    const compressionFactor =  differenceGeneCoordinates / differenceCompressionCoordinates
    return compressionFactor
  }

  export const calculateWidth = (geneToCompression: d3.ScaleLinear<number, number, never>, geneToWindow: d3.ScaleLinear<number, number, never>, windowRange: [number, number], genePosition:number) => {
    const genePositions: number[] = geneToCompression.domain()
    const indexOfCurrentGene: number = genePositions.findIndex(domainPoint => genePosition <= domainPoint ) 
    if(indexOfCurrentGene >= genePositions.length || indexOfCurrentGene === -1){ return 0 }
    const currentGenePosition = genePositions[indexOfCurrentGene]
    const nextGenePosition: number = genePositions[indexOfCurrentGene + 1] 
    const windowCoordinateNext = Math.min(geneToWindow(nextGenePosition), windowRange[1])
    const windowCoordinateCurrent = Math.max(geneToWindow(currentGenePosition), windowRange[0]) //) Math.max(currentGeneToWindowScale(currentGenePosition), this.windowRange[0])
    const width =  windowCoordinateNext - windowCoordinateCurrent 
    return Math.max(width, 0)
  }