import type { GroupInfo, SequenceMetrics } from "@/types"
import { GraphNode, applyOrderConstraint, evaluateForces as evaluateForcesNode, applyMinimumdistance, type xConnections, evaluateForcesY, GraphNodeGroup } from "./springSimulationUtils"
import { abs } from "./math"

export const runForceSimulation = ( genes: GroupInfo[], sequences: SequenceMetrics[], fromHeat:number = 1000, toHeat: number = 0.1, initializeOnHomologygroup?:number) => {
  // simulates forces applied to all nodes in the graph
  // if tuning of the evaluateForces function is bad it can result in strange behaviour (ugly layout)  
  let heat = fromHeat
    let nodeGroups: GraphNodeGroup[] = []
    let nodes: GraphNode[] = []
    let excludedHomologyGroup = 0 // 232290464
 
    //genes to nodes
    genes.forEach((gene, index) => {
      const uId = gene.gene_id + '_' + index.toString()  // add index to get unique id
      nodes.push(new GraphNode(uId, gene.mRNA_start_position, gene.mRNA_end_position, gene.homology_id, gene.sequence_number, `${gene.genome_number}_${gene.sequence_number}` ))
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

    // Form grous of overlappiung nodes
    nodeGroups = createNodeGroups(nodes)
    
    // add x connections
    const sortedNodeGroups = nodeGroups.sort((a,b) => a.position-b.position)
    sortedNodeGroups.forEach((currentGroup, i) => {
      const nodesOnSameSequence = sortedNodeGroups.filter(d => d.sequenceId === currentGroup.sequenceId)
      const currentGroupIndex = nodesOnSameSequence.findIndex(d => d.id === currentGroup.id)
      const leftGroupConnection = currentGroupIndex === 0 ? undefined : nodesOnSameSequence[currentGroupIndex - 1]
      const rightGroupConnection = currentGroupIndex > nodesOnSameSequence.length - 2 ? undefined : nodesOnSameSequence[currentGroupIndex +1]

      const leftConnection: [string, number] | undefined = leftGroupConnection === undefined ? undefined : [ leftGroupConnection.id,  leftGroupConnection.endPosition - currentGroup.position]
      const rightConnection:  [string, number] | undefined = rightGroupConnection === undefined ? undefined : [ rightGroupConnection.id, rightGroupConnection.position - currentGroup.endPosition]
      currentGroup.connectionsX = {left: leftConnection, right: rightConnection}
    })

    // addy connections
    nodeGroups.forEach(group => {
      const yConnections = group.nodes.flatMap(node => node.connectionsY)
      const yConnectionsGroup: string[] = []
      yConnections.forEach(d => {
        const neighbour = nodeGroups.find(group => group.nodeIds.includes(d))
        if(neighbour !== undefined) { 
          yConnectionsGroup.push(neighbour.id)
        }
      })
      group.connectionsY = yConnectionsGroup
    })


    let terminate = false
    let nIterations = 0
    let largestStep = 0
    let currentHeatNIterations = 0
    while(true) {
      [nodeGroups, terminate, largestStep] = updateNodeGroups(nodeGroups, heat)

      nIterations = nIterations + 1
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
        return nodeGroups.flatMap(nodeGroup => nodeGroup.nodes) }
    }
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

export const updateNodeGroups = (nodeGroups: GraphNodeGroup[], heat: number, excludedHomologyGroup:number=0): [GraphNodeGroup[], boolean, number] => {
  const newUpdatedNodes:GraphNodeGroup[] = []
  let terminate = false
  let largestStep = 0
  const touchingDistance = 1000

  for(const group of nodeGroups) {
    const leftNodeGroup = group.connectionsX.left ? nodeGroups.find(d => d.id === group.connectionsX.left![0]) : undefined
    const rightNodeGroup = group.connectionsX.right ? nodeGroups.find(d => d.id === group.connectionsX.right![0]) : undefined
    const connectedXNodes = [leftNodeGroup, rightNodeGroup]
    const connectedYNodes = nodeGroups.filter(d => group.connectionsY.includes(d.id))        
    let [force, dummy] = evaluateForcesNode(group, connectedXNodes, connectedYNodes, heat, excludedHomologyGroup)
    // if(group.id === 'C88_C05H1G005050_148group') {console.log(force, group.position, connectedXNodes.map(d => d?.position), connectedXNodes.map(d => d?.id), group.connectionsX.left, group.connectionsX.right, connectedYNodes, heat, excludedHomologyGroup)}
    // normal force from the right
    if(rightNodeGroup && abs(rightNodeGroup.position - group.endPosition) <= touchingDistance) {
      const rightLeftNode = rightNodeGroup.connectionsX.left ? nodeGroups.find(d => d.id === rightNodeGroup.connectionsX.left![0]) : undefined
      const rightRightNode = rightNodeGroup.connectionsX.right ? nodeGroups.find(d => d.id === rightNodeGroup.connectionsX.right![0]) : undefined
      const rigthConnectedXNodes = [rightLeftNode, rightRightNode]
      const rightConnectedYNodes = nodeGroups.filter(d => rightNodeGroup.connectionsY.includes(d.id))        

      const [dummy, forcesOnRightNeighbour] = evaluateForcesNode(rightNodeGroup, rigthConnectedXNodes, rightConnectedYNodes, heat, excludedHomologyGroup)
      force = force + Math.min(forcesOnRightNeighbour, 0)
    }
    // normal force from the left
    if(leftNodeGroup && abs(leftNodeGroup.endPosition - group.position) <= touchingDistance) {
      const rightLeftNode = leftNodeGroup.connectionsX.left ? nodeGroups.find(d => d.id === leftNodeGroup.connectionsX.left![0]) : undefined
      const rightRightNode = leftNodeGroup.connectionsX.right ? nodeGroups.find(d => d.id === leftNodeGroup.connectionsX.right![0]) : undefined
      const rigthConnectedXNodes = [rightLeftNode, rightRightNode]
      const rightConnectedYNodes = nodeGroups.filter(d => leftNodeGroup.connectionsY.includes(d.id))        

      const [dummy, forcesOnLeftNeighbour] = evaluateForcesNode(leftNodeGroup, rigthConnectedXNodes, rightConnectedYNodes, heat, excludedHomologyGroup)
      force = force + Math.max(forcesOnLeftNeighbour, 0)

    }
    // local temperature change to reduce oscilation() (Frick et al.)
    if(Math.sign(group.lastMove) !== Math.sign(force) ) {group.localTempScaling = group.localTempScaling * 0.9}
    else {group.localTempScaling = group.localTempScaling * 1.1}
    const deltaPos = force * group.localTempScaling
    const deltaPosConstrained: number =  applyOrderConstraint(group, connectedXNodes, deltaPos, heat)
    const newPositionConstrained = group.position + deltaPosConstrained
    group.position = newPositionConstrained

    const updatedNode = new GraphNodeGroup(group.nodes, group.originalRange, group.id)
    updatedNode.connectionsX = group.connectionsX
    updatedNode.connectionsY = group.connectionsY
    updatedNode.lastMove = deltaPosConstrained
    updatedNode.localTempScaling = group.localTempScaling
    newUpdatedNodes.push(updatedNode)
    largestStep = Math.abs(deltaPosConstrained) > largestStep ? Math.abs(deltaPosConstrained) : largestStep
  }
  if(Math.abs(largestStep) < 1) { terminate = true }
  // enforce minimum distance
  const newNodes: (GraphNodeGroup)[] = []
  const uniqueSequences: string[] = []
  newUpdatedNodes.map(d => d.sequenceId).forEach(d => {
    if(uniqueSequences.includes(d)) { return }
    uniqueSequences.push(d)
  })
  uniqueSequences.forEach( sequence => {
    const currentSequence = sequence
    const nodesOnSequence = newUpdatedNodes.filter(d => d.sequenceId === currentSequence) 
    const spreadNodes = applyMinimumdistance(nodesOnSequence, 1_00) as GraphNodeGroup[]
    // const addedNewNodes = spreadNodes
    newNodes.push(...spreadNodes)
  })

  // check for order changes
  // checkNodeOrder(newNodes)
  return [newNodes, terminate, largestStep]
}

const createNodeGroups = (nodes: GraphNode[]): GraphNodeGroup[] => {
  const uniqueSequences: number[] = []
    nodes.map(d => d.sequence).forEach(d => {
      if(uniqueSequences.includes(d)) { return }
      uniqueSequences.push(d)
    })

  const groups: GraphNodeGroup[] = []
  uniqueSequences.forEach(currentSequence => {
    const groupsInSequence: GraphNodeGroup[] = []
    const nodesInSequence: GraphNode[] = nodes.filter(node => node.sequence === currentSequence)
    // let currentNodeGroup:GraphNode[] = []
    if(nodesInSequence.length === 0 ) {return []}

    nodesInSequence.forEach(node => {
      if(groupsInSequence.length === 0 ) {groupsInSequence.push(new GraphNodeGroup([node]))}
      else if(rangesOverlap(node.range,  groupsInSequence[groupsInSequence.length - 1].range)) {
        groupsInSequence[groupsInSequence.length - 1].addNode(node)
      }
      else {
        groupsInSequence.push(new GraphNodeGroup([node]))
      }
    })
    groups.push(...groupsInSequence)
  })
  return groups
}

const rangesOverlap = (range1: [number, number], range2:[number, number]): boolean => {
  let overlaps = true
  if(range1[1] < range2[0]) { return false }
  if( range2[1] < range1[0]) { return false}
  return overlaps
}