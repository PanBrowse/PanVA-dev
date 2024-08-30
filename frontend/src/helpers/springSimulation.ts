import type { GroupInfo, SequenceMetrics } from "@/types"
import { GraphNode, applyMinimumdistanceOnSequence,  GraphNodeGroup, createNodeGroups, genesToNodes,  updateHighStressNodeGroup } from "./springSimulationUtils"

export const runSpringSimulation = ( nodes: GraphNode[], sequences: SequenceMetrics[], fromHeat:number = 1000, toHeat: number = 0.1, initializeOnHomologygroup?:number): [GraphNode[], GraphNodeGroup[], number] => {
  // simulates forces applied to all nodes in the graph
  // if tuning of the evaluateForces function is bad it can result in strange behaviour (ugly layout)  
  let heat = fromHeat
  let nodeGroups: GraphNodeGroup[] = []

  let excludedHomologyGroup = 0 // 232290464
  const touchingDistance = 100

  // initalize with centering on a specific homologygroup
  if(initializeOnHomologygroup !== undefined) {
    let anchor = 0
    sequences.forEach((sequence) => {
      const sequenceMembers = nodes.filter(d => d.sequenceId === sequence.sequence_id)
      const anchorElement = sequenceMembers.find(d => d.homologyGroup === initializeOnHomologygroup)
      if(anchorElement === undefined) {anchor = 0}
      else {anchor = anchorElement.position}
      sequenceMembers.forEach(gene => {
        gene.position = gene.position - anchor
      })
    })
  }

  // Form grous of overlappiung nodes
  nodeGroups = createNodeGroups(nodes)

  let terminate = false
  let nIterations = 0
  let largestStep = 0
  let currentHeatNIterations = 0
  while(true) {
    [nodeGroups, terminate] = updateHighStressNodeGroup(nodeGroups, heat, touchingDistance)

    nIterations = nIterations + 1
    currentHeatNIterations = currentHeatNIterations + 1
    // repeat calculations for the same heat a few times (Davidson and Harel)
    if(currentHeatNIterations > 20) {
      heat = heat * 0.99
      currentHeatNIterations = 0
    }
    if(terminate || (heat <= toHeat)) {  

      // uncomment to center final nodes on the initializeHomologygroup
      // if(initializeOnHomologygroup !== undefined) {
      //   let anchor = 0
      //   sequences.forEach((sequence) => {
      //     const sequenceMembers = nodes.filter(d => d.sequenceId === sequence.sequence_id)
      //     const anchorElement = sequenceMembers.find(d => d.homologyGroup === initializeOnHomologygroup)
      //     if(anchorElement === undefined) {anchor = 0}
      //     else {anchor = anchorElement.position}
      //     sequenceMembers.forEach(gene => {
      //       gene.position = gene.position - anchor
      //     })
      //   })
      // }

      console.log(nIterations, 'iterations in simulation')
      return [nodeGroups.flatMap(nodeGroup => nodeGroup.nodes), nodeGroups, heat] as [GraphNode[], GraphNodeGroup[], number]
    }
  }
}




