import type { GroupInfo, SequenceMetrics } from "@/types"
import { GraphNode, applyOrderConstraint, evaluateForces as evaluateForcesNode, applyMinimumdistance, type xConnections, evaluateForcesY } from "./springSimulationUtils"
import { abs } from "./math"

export const runForceSimulation = ( genes: GroupInfo[], sequences: SequenceMetrics[], fromHeat:number = 1000, toHeat: number = 0.1, initializeOnHomologygroup?:number) => {
  // simulates forces applied to all nodes in the graph
  // if tuning of the evaluateForces function is bad it can result in strange behaviour (ugly layout)  
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
    let nIterations = 0
    let largestStep = 0
    let currentHeatNIterations = 0
    while(true) {
      [nodes, terminate, largestStep] = updateNodes(nodes, heat)

      nIterations = nIterations +1
      currentHeatNIterations = currentHeatNIterations + 1
      // repeat calculations for the same heat a few times (Davidson and Harel)
      if(currentHeatNIterations > 9) {
        heat = heat * 0.95
        currentHeatNIterations = 0
      }
      if(terminate) {  
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
        return nodes }
    }
  }

  export const updateNodes = (nodes: GraphNode[], heat: number, excludedHomologyGroup:number=0): [GraphNode[], boolean, number] => {
    const newUpdatedNodes:GraphNode[] = []
    let terminate = false
    let largestStep = 0
    const touchingDistance = 1000

    for(const node of nodes) {
      const leftNode = node.connectionsX.left ? nodes.find(d => d.id === node.connectionsX.left![0]) : undefined
      const rightNode = node.connectionsX.right ? nodes.find(d => d.id === node.connectionsX.right![0]) : undefined
      const connectedXNodes = [leftNode, rightNode]
      const connectedYNodes = nodes.filter(d => node.connectionsY.includes(d.id))        
      let [force, dummy] = evaluateForcesNode(node, connectedXNodes, connectedYNodes, heat, excludedHomologyGroup)

      // normal force from the right
      if(rightNode && abs(rightNode.position - node.position) <= touchingDistance) {
        const rightLeftNode = rightNode.connectionsX.left ? nodes.find(d => d.id === rightNode.connectionsX.left![0]) : undefined
        const rightRightNode = rightNode.connectionsX.right ? nodes.find(d => d.id === rightNode.connectionsX.right![0]) : undefined
        const rigthConnectedXNodes = [rightLeftNode, rightRightNode]
        const rightConnectedYNodes = nodes.filter(d => rightNode.connectionsY.includes(d.id))        

        const [dummy, forcesOnRightNeighbour] = evaluateForcesNode(rightNode, rigthConnectedXNodes, rightConnectedYNodes, heat, excludedHomologyGroup)
        force = force + Math.min(forcesOnRightNeighbour, 0)
      }
      // normal force from the left
      if(leftNode && abs(leftNode.position - node.position) <= touchingDistance) {
        const rightLeftNode = leftNode.connectionsX.left ? nodes.find(d => d.id === leftNode.connectionsX.left![0]) : undefined
        const rightRightNode = leftNode.connectionsX.right ? nodes.find(d => d.id === leftNode.connectionsX.right![0]) : undefined
        const rigthConnectedXNodes = [rightLeftNode, rightRightNode]
        const rightConnectedYNodes = nodes.filter(d => leftNode.connectionsY.includes(d.id))        

        const [dummy, forcesOnLeftNeighbour] = evaluateForcesNode(leftNode, rigthConnectedXNodes, rightConnectedYNodes, heat, excludedHomologyGroup)
        force = force + Math.max(forcesOnLeftNeighbour, 0)

      }
      // local temperature change to reduce oscilation() (Frick et al.)
      if(Math.sign(node.lastMove) !== Math.sign(force) ) {node.localTempScaling = node.localTempScaling * 0.9}
      else {node.localTempScaling = node.localTempScaling * 1.1}
      
      const deltaPos = force * node.localTempScaling
      const deltaPosConstrained =  applyOrderConstraint(node, connectedXNodes, deltaPos, heat)
      const newPositionConstrained = node.position + deltaPosConstrained

      const updatedNode = new GraphNode(node.id, newPositionConstrained, node.homologyGroup, node.sequence, node.sequenceId, node.originalPosition)
      updatedNode.connectionsX = node.connectionsX
      updatedNode.connectionsY = node.connectionsY
      updatedNode.lastMove = deltaPosConstrained
      updatedNode.localTempScaling = node.localTempScaling
      newUpdatedNodes.push(updatedNode)
      largestStep = Math.abs(deltaPosConstrained) > largestStep ? Math.abs(deltaPosConstrained) : largestStep
    }
    // console.log(largestStep)
    if(Math.abs(largestStep) < 10) { terminate = true }
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
      const spreadNodes = applyMinimumdistance(nodesOnSequence, 1_00)
      newNodes.push(...spreadNodes)
    })

    // check for order changes
    checkNodeOrder(newNodes)
    return [newNodes, terminate, largestStep]
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