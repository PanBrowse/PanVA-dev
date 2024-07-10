import type { GroupInfo, SequenceMetrics } from "@/types"
import { GraphNode, applyOrderConstraint, evaluateForces, applyMinimumdistance, type xConnections } from "./springSimulationUtils"

export const runForceSimulation = ( genes: GroupInfo[], sequences: SequenceMetrics[], fromHeat:number = 1000, toHeat: number = 0.1, initializeOnHomologygroup?:number) => {
    let heat = fromHeat
    let nodes: GraphNode[] = []
    let excludedHomologyGroup = 0 // 232290464
 
    //genes to nodes
    genes.forEach((gene, index) => {
      // add index to get unique id
      const uId = gene.gene_id + '_' + index.toString()
      nodes.push(new GraphNode(uId, gene.gene_start_position, gene.homology_id, gene.sequence_number, `${gene.genome_number}_${gene.sequence_number}` ))
    })
    nodes.sort((d,b) => d.position - b.position)

    // assign connections
    nodes.forEach(currentNode => {
      const currentHomologyGroup = currentNode.homologyGroup
      const currentSequece = currentNode.sequence
      const nodesOnSameSequence = nodes.filter(d => d.sequence === currentSequece)
      const index = nodesOnSameSequence.findIndex(d => d.position === currentNode.position)

      let xConnectionSpec: xConnections = {left:undefined, right: undefined}
      if(index === 0) {
        const comparativeNode = nodesOnSameSequence[index + 1]
        const id = comparativeNode.id
        const distance = comparativeNode.position - currentNode.position
        xConnectionSpec = {left: undefined, right:[ id, distance ]}
      }  
      else if(index === nodesOnSameSequence.length - 1) {
        const comparativeNode = nodesOnSameSequence[index - 1]
        const id = comparativeNode.id
        const distance = comparativeNode.position - currentNode.position
        xConnectionSpec = {left: [id, distance], right: undefined}
      }
      else {
        const id1 = nodesOnSameSequence[index - 1].id
        const distance1 = nodesOnSameSequence[index - 1].position - currentNode.position
        const id2 = nodesOnSameSequence[index + 1].id
        const distance2 = nodesOnSameSequence[index + 1].position - currentNode.position
        xConnectionSpec = {left: [id1, distance1], right: [id2, distance2]}
      }
      
      const yConnections = nodes.filter(d => d.homologyGroup === currentHomologyGroup ).map(d => d.id)

      currentNode.connectionsX = xConnectionSpec
      currentNode.connectionsY = yConnections
    })

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

    let terminate = false
    while(true) {
      [nodes, terminate] = updateNodes(nodes, heat)
      heat = heat * 0.95
      if(terminate) { return nodes }
    }
  }

  export const updateNodes = (nodes: GraphNode[], heat: number, excludedHomologyGroup:number=0): [GraphNode[], boolean] => {
    const newUpdatedNodes:GraphNode[] = []
    let terminate = false
    let largestStep = 0
    for(const node of nodes) {
      const leftNode = node.connectionsX.left ? nodes.find(d => d.id === node.connectionsX.left![0]) : undefined
      const rightNode = node.connectionsX.right ? nodes.find(d => d.id === node.connectionsX.right![0]) : undefined
      const connectedXNodes = [leftNode, rightNode]
      const connectedYNodes = nodes.filter(d => node.connectionsY.includes(d.id))        
      let force = evaluateForces(node, connectedXNodes, connectedYNodes, heat, excludedHomologyGroup)
      force = force 
      const deltaPos = (force * heat)
      const deltaPosConstrained =  applyOrderConstraint(node, connectedXNodes, deltaPos)
      const newPositionConstrained = node.position + deltaPosConstrained

      const updatedNode = new GraphNode(node.id, newPositionConstrained, node.homologyGroup, node.sequence, node.sequenceId, node.originalPosition)
      updatedNode.connectionsX = node.connectionsX
      updatedNode.connectionsY = node.connectionsY
      newUpdatedNodes.push(updatedNode)
      largestStep = Math.abs(deltaPosConstrained) > largestStep ? Math.abs(deltaPosConstrained) : largestStep
    }
    if(Math.abs(largestStep) < 0.1) { terminate = true }
    // enforce minimum distance
    const newNodes: GraphNode[] = []
    const uniqueSequences: number[] = []
    newUpdatedNodes.map(d => d.sequence).forEach(d => {
      if(uniqueSequences.includes(d)) { return }
      uniqueSequences.push(d)
    })
    uniqueSequences.forEach( sequence => {
      const currentSequence = sequence
      const nodesOnSequence = newUpdatedNodes.filter(d => d.sequence === currentSequence) 
      const spreadNodes = applyMinimumdistance(nodesOnSequence, 1000000)
      newNodes.push(...spreadNodes)
    })

    // check for order changes
    checkNodeOrder(newNodes)
    return [newNodes, terminate]
  }

const checkNodeOrder = (newNodes: GraphNode[]) => {
  newNodes.forEach((node, i) => {
    [node.connectionsX.left, node.connectionsX.right].forEach((connection, index) => {
      if(connection === undefined){return}
      const connectionNode = newNodes.find(node => node.id === connection[0])
      if(connectionNode === undefined) { return }

      const currentDistance = connectionNode.position - node.position
      const expectedDistance = connection[1]
      if(Math.sign(currentDistance) !== Math.sign(expectedDistance)) { console.log('unordered', i, index) }
    })
  })
}