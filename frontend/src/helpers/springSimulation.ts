import type { GroupInfo, SequenceMetrics } from "@/types"
import * as d3 from 'd3'
import { abs, max, min } from "./math"
import { GraphNode, minDistanceConstraintShift, applyOrderConstraint, evaluateForces, applyMinimumdistance } from "./springSimulationUtils"

export const runForceSimulation = ( genes: GroupInfo[], sequences: SequenceMetrics[]) => {
    let heat = 1000
    let nodes: GraphNode[] = []
    let excludedHomologyGroup =0 // 232290464
 
    //genes to nodes
    genes.forEach((gene, index) => {
      // add index to get unique id
      const uId = gene.gene_id + '_' + index.toString()
      nodes.push(new GraphNode(uId, gene.gene_start_position, gene.homology_id, gene.sequence_number, `${gene.genome_number}_${gene.sequence_number}` ))
    })
    nodes.sort((d,b) => d.position- b.position)

    // assign connections
    nodes.forEach(currentNode => {
      const currentHomologyGroup = currentNode.homologyGroup
      const currentSequece = currentNode.sequence
      const nodesOnSameSequence = nodes.filter(d => d.sequence === currentSequece)
      const index = nodesOnSameSequence.findIndex(d => d.position === currentNode.position)

      let xConnections: [id:string, distance: number][] = []
      if(index === 0) {
        const comparativeNode = nodesOnSameSequence[index + 1]
        const id = comparativeNode.id
        const distance = comparativeNode.position - currentNode.position
        xConnections = [ [ id, distance ]]
      }  
      else if(index === nodesOnSameSequence.length - 1) {
        const comparativeNode = nodesOnSameSequence[index - 1]
        const id = comparativeNode.id
        const distance = comparativeNode.position - currentNode.position
        xConnections = [ [id, distance]]
      }
      else {
        const id1 = nodesOnSameSequence[index - 1].id
        const distance1 = nodesOnSameSequence[index - 1].position - currentNode.position
        const id2 = nodesOnSameSequence[index + 1].id
        const distance2 = nodesOnSameSequence[index + 1].position - currentNode.position
        xConnections= [[id1, distance1], [id2, distance2]]
      }
      
      const yConnections = nodes.filter(d => d.homologyGroup === currentHomologyGroup ).map(d => d.id)

      currentNode.connectionsX = xConnections
      currentNode.connectionsY = yConnections
    })
   
    const updateNodes = (heat: number) => {
      const newUpdatedNodes:GraphNode[] = []

      for(const node of nodes) {
        const connectedXNodes = nodes.filter(d => node.connectionsX.map(d => d[0]).includes(d.id))
        const connectedYNodes = nodes.filter(d => node.connectionsY.includes(d.id))        
        let force = evaluateForces(node, connectedXNodes, connectedYNodes, heat, excludedHomologyGroup)
        force = force / 10
        const deltaPos = (force * heat)
        const deltaPosConstrained =  applyOrderConstraint(node, connectedXNodes, deltaPos)
        const newPositionConstrained = node.position + deltaPosConstrained

        const updatedNode = new GraphNode(node.id, newPositionConstrained, node.homologyGroup, node.sequence, node.sequenceId, node.originalPosition)
        updatedNode.connectionsX = node.connectionsX
        updatedNode.connectionsY = node.connectionsY
        newUpdatedNodes.push(updatedNode)
      }

      // enforce minimum distance
      const newNodes: GraphNode[] = []
      const uniqueSequences: number[] = []
      newUpdatedNodes.map(d => d.sequence).forEach(d => {
        if(uniqueSequences.includes(d)) { return  }
        uniqueSequences.push(d)
      })
      uniqueSequences.forEach( sequence => {
        //apply minimum distances within each sequence
        const currentSequence = sequence
        const nodesOnSequence = newUpdatedNodes.filter(d => d.sequence === currentSequence) 
        const spreadNodes = applyMinimumdistance(nodesOnSequence, 1000000)
        newNodes.push(...spreadNodes)
      })
      
      nodes = newNodes

      // check for order changes
      newNodes.forEach((node, i) => {
        node.connectionsX.forEach((connection, index) => {
          const connectionNode = newNodes.find(node => node.id === connection[0])
          if(connectionNode === undefined) { return }

          const currentDistance = connectionNode.position - node.position
          const expectedDistance = connection[1]
          if(Math.sign(currentDistance) !== Math.sign(expectedDistance)) { console.log('unordered', heat, i, index) }
        })
      })
    }

    while(true) {
      if(heat < 0.1) { return nodes }
      updateNodes( heat)
      heat = heat * 0.95
    }
  }

