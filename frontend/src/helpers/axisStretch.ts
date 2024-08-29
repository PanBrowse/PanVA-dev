import * as d3 from 'd3'
import type { GraphNode, GraphNodeGroup } from  "./springSimulationUtils"

export const updateViewportRangeBounds = (
  inputScale: d3.ScaleLinear<number, number, never>, 
  newRangeBoundsGlobal: [number, number], 
  referenceScale: d3.ScaleLinear<number, number, never>, 
  assignedWindowRange?:[number, number]
) => {
    if(newRangeBoundsGlobal[0] === newRangeBoundsGlobal[1]) {return inputScale}
    const compressedRange: number[] = referenceScale.range()
    const windowRange = assignedWindowRange ?? [compressedRange[0], compressedRange[compressedRange.length-1]]
    const geneDomain = referenceScale.domain()
    const newRangeGlobal = newRangeBoundsGlobal
    // find points in the new view range
    const newWindowFirstGeneIndex: number = compressedRange.findIndex(d => d >= newRangeGlobal[0])
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


  export const filterUniquePosition = (genes: (GraphNode| GraphNodeGroup)[]) => {
    const uniquePositions: number[] = []
    const uniquePositionGenes: (GraphNode | GraphNodeGroup)[] = []
    const dummy = genes.filter(d => {
      if(uniquePositions.includes(d.originalPosition)) {return false}
      uniquePositions.push(d.originalPosition)
      uniquePositionGenes.push(d)
      return true
    })
    return uniquePositionGenes
  }


  export const calculateIndividualScales = (
    genePositionsOnSequence: (GraphNode[] | GraphNodeGroup[]), 
    newCompressionRangeEdges: [number, number], 
    windowRangeEdges: [number, number]
  ):[d3.ScaleLinear<number, number, never>, d3.ScaleLinear<number, number, never>] => {
    //filter unique positions (to avoid undefined behaviour from d3 scale)
    const uniqueGenePositions = filterUniquePosition(genePositionsOnSequence)

    //create scale from gene coordinates to compressed coordinates
    const compressionRange = uniqueGenePositions.flatMap(d => [d.position, d.endPosition] )
    const geneRangeInner = uniqueGenePositions.flatMap(d => [d.originalPosition, d.originalPosition + d.width] )
    const geneToCompressionScale = d3.scaleLinear().domain(geneRangeInner).range(compressionRange)
    
    // create scale from gene coordinates to viewPort (window) coordinates
    const endPointsGeneRange = [geneToCompressionScale.invert(newCompressionRangeEdges[0]), geneToCompressionScale.invert(newCompressionRangeEdges[1])]
    const geneRange = geneRangeInner[geneRangeInner.length - 1] === endPointsGeneRange[1] ?  [endPointsGeneRange[0]  , ...geneRangeInner] : [endPointsGeneRange[0]  , ...geneRangeInner, endPointsGeneRange[1]]
    const scaleCompressionToWindow = d3.scaleLinear().domain(newCompressionRangeEdges).range(windowRangeEdges)
    const windowRangeInner = compressionRange.map(d => scaleCompressionToWindow(d))
    const windowRange = windowRangeInner[windowRangeInner.length -1 ] === windowRangeEdges[1] ? [windowRangeEdges[0], ...windowRangeInner] : [windowRangeEdges[0], ...windowRangeInner, windowRangeEdges[1]]
    const geneToWindowScale = d3.scaleLinear().domain(geneRange).range(windowRange)

    return [geneToCompressionScale, geneToWindowScale]

  }

  export const calculateCompressionFactor = (geneToCompression:d3.ScaleLinear<number, number, never>, genePosition: number) => {
    // GeneCoordinate distance divided by compressed coordinate distance
    // is <1 when stretched, >1 when compressed
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
    if(indexOfCurrentGene >= genePositions.length -1 || indexOfCurrentGene === -1){ return 0 }
    const currentGenePosition = genePositions[indexOfCurrentGene]
    const nextGenePosition: number = genePositions[indexOfCurrentGene + 1] 

    let windowCoordinateNext =geneToWindow(nextGenePosition)// Math.min(geneToWindow(nextGenePosition), windowRange[1])
    if(nextGenePosition === undefined) { windowCoordinateNext = windowRange[1] }
    if(geneToWindow(nextGenePosition) < windowRange[0]) {return 0}

    const windowCoordinateCurrent = geneToWindow(currentGenePosition) //Math.max(geneToWindow(currentGenePosition), windowRange[0]) //) Math.max(currentGeneToWindowScale(currentGenePosition), this.windowRange[0])
    const width = windowCoordinateNext - windowCoordinateCurrent 
    return Math.max(width, 0)
  }