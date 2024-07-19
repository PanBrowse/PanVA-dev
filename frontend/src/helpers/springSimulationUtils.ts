import type { Dictionary } from "lodash"
import { abs } from "./math"
import { filterUniquePosition } from "./axisStretch"
import type { GroupInfo } from "@/types"
import { evaluateForces, findNeighgourNodes, findNormalForces } from "./springSimulationForceCalculations"

export interface xConnections {
  left: [id:string, distance: number] | undefined,
  right: [id:string, distance:number] | undefined
}
export class GraphNode {
    private _id: string
    private _position: number
    private _homologyGroup: number
    private _sequence: number
    private _connectionsX: xConnections = {left:undefined, right: undefined}
    private _connectionsY: string[] = []
    private _sequenceId: string
    private _originalPosition: number
    private _lastMove: number = 0
    private _localTempScaling: number = 1
    private _width: number
  
    constructor(id:string, position: number, endPosition:number,homologyGroup:number, sequence: number, sequenceId: string, originalPosition?: number) {
      this._id = id,
      this._position = position
      this._homologyGroup = homologyGroup
      this._sequence = sequence
      this._sequenceId = sequenceId
      this._originalPosition = originalPosition ?? position
      this._width = endPosition - position
    }
  
    public get id() {return this._id}
    public get position() {return this._position}
    public get endPosition() {return this._width + this.position}
    public get originalPosition() {return this._originalPosition}
    public get sequence() {return this._sequence}
    public get sequenceId() {return this._sequenceId}
    public get homologyGroup() {return this._homologyGroup}
    public get connectionsX() {return this._connectionsX}
    public get connectionsY() {return this._connectionsY}
    public get lastMove() {return this._lastMove}
    public get localTempScaling() {return this._localTempScaling}
    public get width() {return this._width }
    public get range() {return [this.position, this.position + this.width] as [number, number]}
  
    public set connectionsX(connections: xConnections) {this._connectionsX = connections}
    public set connectionsY(connections: string[]) {this._connectionsY = connections}
    public set position(newPos: number) { this._position = newPos }
    public set width(newWidth: number) { this._width = newWidth }
    public set lastMove(newMove: number) {this._lastMove = newMove}
    public set localTempScaling(newScale: number) {this._localTempScaling = Math.abs(newScale)}
  }
  
  export class GraphNodeGroup {
    private _nodes: GraphNode[]
    private _originalRange: [number, number]
    private _xConnections: xConnections
    private _yConnections: string[]
    private _id: string
    private _lastMove: number
    private _localTempScaling: number

    constructor(nodes: GraphNode[], originalRange?: [number, number], id?: string, xConnections?: xConnections, yConnections?: string[], lastMove?:number, localTempScaling?:number) {
      const newNodes: GraphNode[] = []
      nodes.forEach(node => {
        const newNode = new GraphNode(node.id, node.position, node.endPosition, node.homologyGroup, node.sequence, node.sequenceId, node.originalPosition)
        newNode.connectionsX = node.connectionsX
        newNode.connectionsY = node.connectionsY
        newNode.lastMove = node.lastMove
        newNode.localTempScaling = node.localTempScaling
        newNodes.push(newNode)
      })
      this._nodes = newNodes
      this._originalRange = originalRange ?? calculateRange(nodes)
      this._id = id ?? nodes[0].id + 'group'
      this._xConnections = xConnections ?? {left: undefined, right: undefined} 
      this._yConnections = yConnections ?? []
      this._lastMove = lastMove ?? 0
      this._localTempScaling = localTempScaling ?? 1
    }

    public get nodes() {return this._nodes}
    public get homologyGroups() {return this._nodes.map(node => node.homologyGroup)}
    public get range() {return calculateRange(this._nodes)}
    public get originalRange() {return this._originalRange}
    public get originalPosition() {return this._originalRange[0]}
    public get position() {return this.range[0]}
    public get endPosition() {return this.range[1]}
    public get connectionsX() {return this._xConnections}
    public get connectionsY() {return this._yConnections}
    public get id() {return this._id}
    public get nodeIds() {return this._nodes.map(d => d.id)}
    public get sequenceId() {return this._nodes[0].sequenceId}
    public get lastMove() {return this._lastMove}
    public get localTempScaling() {return this._localTempScaling}
    public get width() {return this.range[1] - this.range[0]}

    // public set range(newRange: [number, number]) {this._range = newRange}
    public set originalRange(newRange: [number, number]) {this._originalRange = newRange}
    public set position(newPosition: number) { 
      const oldEnd = this.endPosition
      const oldStart = this.position
      const newStart = newPosition

      // update nodes as well
      this._nodes.forEach(node => {
        const nodeOffsetWithinGroup:number = node.position - oldStart
        node.position = newStart + nodeOffsetWithinGroup
      })
    }
    public set connectionsX(newConnections: xConnections) {this._xConnections = newConnections}
    public set connectionsY(newConnections: string[]) {this._yConnections = newConnections}
    public set lastMove(newMove: number) {this._lastMove = newMove}
    public set localTempScaling(newScale: number) {this._localTempScaling = Math.abs(newScale)}

    public addNode(newNode: GraphNode) {
      this._nodes.push(newNode)
    }
  }

  
export const applyOrderConstraint = (currentNode: GraphNode | GraphNodeGroup, connectedXNodes: (GraphNode|GraphNodeGroup|undefined)[], deltaPosIn: number, heat: number) => {
  // maximum allowed move depends on the heat (Davidson and Harel)
  const maxMove = 1000 * heat
  let bounds = [-maxMove, maxMove]
  let deltaPos: number = deltaPosIn
  //calculate bounds
  const connectedRight = connectedXNodes[1]
  const connectedLeft = connectedXNodes[0]
  const previousDistanceRight = connectedRight ? connectedRight.position - currentNode.endPosition : maxMove
  const previousDistanceLeft = connectedLeft ? connectedLeft.endPosition - currentNode.position : -maxMove
  bounds[0] = Math.max(previousDistanceLeft * 3 / 7, -maxMove)
  bounds[1] = Math.min(previousDistanceRight * 3 / 7,maxMove)
  //apply bounds
  if(deltaPos < 0) {
    deltaPos = Math.max(deltaPos, bounds[0])
  }
  else {
    deltaPos = Math.min(deltaPos, bounds[1])
  }
  return deltaPos
}
  
export const calculateShiftMinDist = (currentSequenceNodes: (GraphNode | GraphNodeGroup)[] , minimumAbsoluteDistance: number): Dictionary<number> => {
  let accumulatedShift = 0
  //don't apply to nodes in the same position
  const uniquePositionNodes = filterUniquePosition(currentSequenceNodes)
  const shiftCoefficients: Dictionary<number> = {}

  uniquePositionNodes.forEach((currentNode) => {
    const precedingNode = currentNode.connectionsX.left ? currentSequenceNodes.find(d => d.id === currentNode.connectionsX.left![0]) : undefined
    if(precedingNode === undefined) { return shiftCoefficients[String(currentNode.originalPosition)] = accumulatedShift }
    const distanceToPreceding = precedingNode.endPosition - currentNode.position
    const minimumDistance = -minimumAbsoluteDistance
    
    const differenceToMinDistance = distanceToPreceding - minimumDistance
    // Shift only if differene to min diff is bigger than 0, which means it is too close
    const shift =  Math.max(0, differenceToMinDistance)
    accumulatedShift = accumulatedShift + shift
    shiftCoefficients[String(currentNode.originalPosition)] = accumulatedShift 
  })
  return shiftCoefficients
}

  export const applyMinimumdistanceOnSequence = (nodesOnSequence: (GraphNode|GraphNodeGroup)[], minimumAbsDistance: number) => {
    const sorted = nodesOnSequence.sort((a,b) => a.originalPosition - b.originalPosition)
    const deltaPosCorrection = calculateShiftMinDist(sorted, minimumAbsDistance)
    sorted.forEach(node => {
      const newPosition = node.position + deltaPosCorrection[`${node.originalPosition}`]
      node.position = newPosition
    })
    return sorted
  }


  const calculateRange = (nodes: GraphNode[]) => {
    if(nodes.length === 0) { return [0, 0] as [number, number]}
    const positions = nodes.flatMap(node => [node.position, node.endPosition]).sort((a,b) => a - b)
    return [positions[0], positions[positions.length - 1]] as [number, number]
  }

  export const rangesOverlap = (range1: [number, number], range2:[number, number]): boolean => {
    let overlaps = true
    if(range1[1] < range2[0]) { return false }
    if( range2[1] < range1[0]) { return false}
    return overlaps
  }


  export const createNodeGroups = (nodes: GraphNode[]): GraphNodeGroup[] => {
    const uniqueSequences: number[] = []
      nodes.map(d => d.sequence).forEach(d => {
        if(uniqueSequences.includes(d)) { return }
        uniqueSequences.push(d)
      })
  
    const groups: GraphNodeGroup[] = []
    uniqueSequences.forEach(currentSequence => {
      const groupsInSequence: GraphNodeGroup[] = []
      const nodesInSequence: GraphNode[] = nodes.filter(node => node.sequence === currentSequence)
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

    addXConnections(groups)
    addYConnections(groups)
    return groups
  }
  
  export const addXConnections = (nodeGroups: (GraphNodeGroup | GraphNode)[]) => {
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
    return sortedNodeGroups
  }

  export const addYConnections = (nodeGroups: GraphNodeGroup[]) => {
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

    return nodeGroups
  }


  export const genesToNodes = (genes: GroupInfo[]) => {
    // Convert genes to graphNodes
    let nodes: GraphNode[] = []
    genes.forEach((gene, index) => {
      const uId = gene.gene_id + '_' + index.toString()  // add index to get unique id
      nodes.push(new GraphNode(uId, gene.mRNA_start_position, gene.mRNA_end_position, gene.homology_id, gene.sequence_number, `${gene.genome_number}_${gene.sequence_number}` ))
    })
    nodes.sort((d,b) => d.position - b.position)

    // assign connections
    addXConnections(nodes)
    nodes.forEach(currentGroup => {
      const yConnections = nodes.filter(d => d.homologyGroup === currentGroup.homologyGroup ).map(d => d.id)
      currentGroup.connectionsY = yConnections
    })
    return nodes
  }

  export const checkNodeOrder = (newNodes: GraphNodeGroup[]) => {
    newNodes.forEach((node, i) => {
      [node.connectionsX.left, node.connectionsX.right].forEach((connection, index) => {
        if(connection === undefined){return}
        const connectionNode = newNodes.find(node => node.id === connection[0])
        if(connectionNode === undefined) { return }
  
        const currentDistance = connectionNode.endPosition - node.position
        const expectedDistance = connection[1]
        if(Math.sign(currentDistance) !== Math.sign(expectedDistance)) { console.log('unordered', i, index) }
      })
    })
  }

  export const updateNodeGroups = (nodeGroups: GraphNodeGroup[], heat: number, excludedHomologyGroup:number=0, touchingDistance:number=1000): [GraphNodeGroup[], boolean] => {
    const newUpdatedNodes:GraphNodeGroup[] = []
    let terminate = false
    let largestStep = 0 // used for the termination condition
  
    // apply forces
    for(const group of nodeGroups) {
      // calculate direct forces
      const connectedXNodes = findNeighgourNodes(group, nodeGroups)
      const connectedYNodes = nodeGroups.filter(d => group.connectionsY.includes(d.id))        
      let [force, dummy] = evaluateForces(group, connectedXNodes, connectedYNodes, heat, excludedHomologyGroup)

      // calculate forces through other blocks "touching"
      const [forceFromLeft, forceFromRight ] = findNormalForces(group, nodeGroups, touchingDistance)
      force = force + forceFromLeft + forceFromRight

      // local temperature changes to reduce oscilations (Frick et al.)
      if(Math.sign(group.lastMove) !== Math.sign(force) ) {group.localTempScaling = group.localTempScaling * 0.9}
      else {group.localTempScaling = group.localTempScaling * 1.1}

      // calculate new position
      const deltaPos = force * group.localTempScaling
      const deltaPosConstrained: number =  applyOrderConstraint(group, connectedXNodes, deltaPos, heat)
      const newPositionConstrained = group.position + deltaPosConstrained
      group.position = newPositionConstrained

      // create new updated node
      const updatedNode = new GraphNodeGroup(group.nodes, group.originalRange, group.id, group.connectionsX, group.connectionsY, deltaPosConstrained, group.localTempScaling)
      newUpdatedNodes.push(updatedNode)

      largestStep = Math.abs(deltaPosConstrained) > largestStep ? Math.abs(deltaPosConstrained) : largestStep
    }

    if(Math.abs(largestStep) < 10) { terminate = true }
    const newNodes = enforceMinimumDistance(newUpdatedNodes, touchingDistance)
    // iteration = iteration + 1
    // check for order changes
    checkNodeOrder(newNodes)
    return [newNodes, terminate]
  }

const enforceMinimumDistance = (inputNodes: GraphNodeGroup[], minimumDistance: number) => {    
  const newNodes: (GraphNodeGroup)[] = []
  const uniqueSequences: string[] = []
  inputNodes.map(d => d.sequenceId).forEach(d => {
    if(uniqueSequences.includes(d)) { return }
    uniqueSequences.push(d)
  })
  uniqueSequences.forEach( sequence => {
    const currentSequence = sequence
    const nodesOnSequence = inputNodes.filter(d => d.sequenceId === currentSequence) 
    const spreadNodes = applyMinimumdistanceOnSequence(nodesOnSequence, minimumDistance) as GraphNodeGroup[]
    newNodes.push(...spreadNodes)
  })
  return newNodes
}