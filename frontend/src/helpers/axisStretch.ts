import type { GroupInfo } from "@/types"
import * as d3 from 'd3'
import { round } from "lodash"

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


export const updateRangeBounds = (inputScale: d3.ScaleLinear<number, any, any>, newLocalRangeBounds: [number, number], referenceScale: d3.ScaleLinear<number, any, any>, assignedWindowRange?:[number, number]) => {
    if(newLocalRangeBounds[0] === newLocalRangeBounds[1]) {return inputScale}
    const newRelariveRangeBoundsSorted = newLocalRangeBounds.sort((a,b) => a-b)
    const referenceRange: number[] = referenceScale.range().sort((a,b) => a-b)
    const windowRange = assignedWindowRange ?? [referenceRange[0], referenceRange[referenceRange.length-1]]
    const oldDomain = [inputScale.domain()[0], inputScale.domain()[inputScale.domain().length -1]]
    const referenceDomain = referenceScale.domain()

    const oldRangeGlobal = [
      referenceScale(oldDomain[0]),
      referenceScale(oldDomain[1])  
    ]

    // calculate new range bounds in global coordinates
    const percentageLeft = newRelariveRangeBoundsSorted[0]/(windowRange[1] - windowRange[0])
    const percentageRight = (newRelariveRangeBoundsSorted[1] - windowRange[1])/(windowRange[1] - windowRange[0])
    const oldRangeLengthGlobal = oldRangeGlobal[1] - oldRangeGlobal[0] 
    const newRangeGlobal = [
      oldRangeGlobal[0] + percentageLeft * oldRangeLengthGlobal,
      oldRangeGlobal[1] + percentageRight * oldRangeLengthGlobal 
    ]

    // find points in the new view range
    const newWindowFirstGeneIndex: number = referenceRange.findIndex(d => d > newRangeGlobal[0])
    const newWindowLastGeneIndex: number = referenceRange.findIndex(d => d > newRangeGlobal[1]) 
    const newRangeInViewGlobal = referenceRange.slice(newWindowFirstGeneIndex, newWindowLastGeneIndex)
    const genesInView = referenceDomain.slice(newWindowFirstGeneIndex, newWindowLastGeneIndex)

    // Calculate newRange and newDomain
    const globalToLocal = d3.scaleLinear().domain(newRangeGlobal).range(windowRange)
    const newRangeInViewLocal = newRangeInViewGlobal.map(d => globalToLocal(d))
    const newRange: number[] = [windowRange[0], ...newRangeInViewLocal, windowRange[1]]
    const newDomain = [referenceScale.invert(newRangeGlobal[0]), ...genesInView, referenceScale.invert(newRangeGlobal[1])]

    return inputScale.domain(newDomain).range(newRange)
  }