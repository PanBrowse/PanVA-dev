import type { Dictionary } from "lodash"
import { abs } from "./math"

export class GraphNode {
    private _id: string
    private _position: number
    private _homologyGroup: number
    private _sequence: number
    private _connectionsX: [id: string, distance: number][] = []
    private _connectionsY: string[] = []
    private _sequenceId: string
    private _originalPosition: number
  
    constructor(id:string, position: number, homologyGroup:number, sequence: number, sequenceId: string, originalPosition?: number) {
      this._id = id,
      this._position = position
      this._homologyGroup = homologyGroup
      this._sequence = sequence
      this._sequenceId = sequenceId
      this._originalPosition = originalPosition ?? position
    }
  
    public get id() {return this._id}
    public get position() {return this._position}
    public get originalPosition() {return this._originalPosition}
    public get sequence() {return this._sequence}
    public get sequenceId() {return this._sequenceId}
    public get homologyGroup() {return this._homologyGroup}
    public get connectionsX() {return this._connectionsX}
    public get connectionsY() {return this._connectionsY}
  
    public set connectionsX(connections: [id: string, distance: number][]) {this._connectionsX = connections}
    public set connectionsY(connections: string[]) {this._connectionsY = connections}
    public set position(newPos: number) { if(newPos >= 0) { this._position = newPos } }
  
  }

export const calculateAttractingForce = (distanceToNeighbour: number, expectedDistance: number) => {
    const differenceToExpectedDistance = distanceToNeighbour - expectedDistance
    if(differenceToExpectedDistance === 0 ) {return 0}
    return Math.log2(Math.abs(differenceToExpectedDistance)) * Math.sign(differenceToExpectedDistance) 
  }
  
  const calculateAttractingForceY = (distanceToNeighbour: number) => {
    if(distanceToNeighbour === 0 ) {return 0}
    return  Math.log2(Math.abs(distanceToNeighbour)) * Math.sign(distanceToNeighbour) * 100
  }
  
  const calculateRepellingForce = (distanceToNeighbour: number, expectedDistance: number) => {
    return -1/Math.pow(distanceToNeighbour, 4) * Math.sign(distanceToNeighbour) * Math.pow(expectedDistance, 2) * 10000
  }
  
  const calculateGravityForce = (distanceToNeighbour: number) => {
    if(distanceToNeighbour === 0 ) {return 0}
    return Math.abs(distanceToNeighbour) * Math.sign(distanceToNeighbour)
  }
  
  const calculateNaturalRepellingForce = (distanceToNeighbour: number) => {
    if(distanceToNeighbour === 0 ) {return 0}
    return -1/Math.pow(Math.abs(distanceToNeighbour), 1/10) * Math.sign(distanceToNeighbour)
  }
  
export const evaluateForces = (currentNode:GraphNode, connectedXNodes: GraphNode[], connectedYNodes:GraphNode[], heat: number, excludedHomologyGroup?: number) => {
    let force = 0
    const scalePartialForceY = 100
    const scalePartialForceX = 10
    const scalePartialForceGravity = 1/10
    const scaleRepelling = 0
    // Calculate contribution for all in the same homology group
    connectedYNodes.forEach(connectedNode => {
      const partialForce = calculateAttractingForceY(connectedNode.position - currentNode.position)
  
      if(currentNode.homologyGroup === excludedHomologyGroup) { force = force }
      else { force = force + (partialForce * scalePartialForceY ) }
    })
  
    // calculate contribution from adjacent nodes
    let partialForce = 0
    connectedXNodes.forEach((connectedNode, i) => {
      const neighbourDistance = connectedNode.position - currentNode.position
      const expectedNeighbourDistance = currentNode.connectionsX[i][1]
  
      if(Math.sign(expectedNeighbourDistance) !== Math.sign(neighbourDistance)) {
            // if different signs: order flipped,  this should never happen
          partialForce = calculateAttractingForce(neighbourDistance, expectedNeighbourDistance)
          console.log('order flipped', expectedNeighbourDistance, neighbourDistance, heat)
        }
        // partialForce = partialForce + calculateAttractingForce(neighbourDistance, expectedNeighbourDistance)
  
      else if(abs(neighbourDistance) < abs(expectedNeighbourDistance)) {
        partialForce = calculateRepellingForce(neighbourDistance, expectedNeighbourDistance) * 100
      } else {
        partialForce = calculateAttractingForce(neighbourDistance, expectedNeighbourDistance)
      }
  
      //add a contracting force to condense the view
      const gravityForce = calculateGravityForce(neighbourDistance)
      const repellingForce = calculateNaturalRepellingForce(neighbourDistance)
  
      force = force + (scalePartialForceX * partialForce) + (gravityForce * scalePartialForceGravity) + (repellingForce * scaleRepelling)
    })
    return force
  }
  
export const applyOrderConstraint = (currentNode: GraphNode, connectedXNodes: GraphNode[], deltaPosIn: number) => {
    const maxMove = 100000000
    let bounds = [-maxMove, maxMove]
    let deltaPos = deltaPosIn
  
    //calculate bounds
    connectedXNodes.forEach(connectedNode => {
      const previousDistance = connectedNode.position - currentNode.position
      if(previousDistance < 0) {
        bounds[0] = previousDistance * 3 / 7
      }
      else{
        bounds[1] = previousDistance * 3 / 7
      }
    })
  
    //apply bounds
    if(deltaPos < 0) {
      deltaPos = Math.max(deltaPos, bounds[0])
    }
    else {
      deltaPos = Math.min(deltaPos, bounds[1])
    }
    
    return deltaPos
  }
  
  export const minDistanceConstraintShift = (currentSequenceNodes: GraphNode[] , minimumAbsDistance: number): Dictionary<number> => {
    let previousShift = 0
    //filter out nodes in the same position
    const uniquePositions: number[] = []
    const uniquePositionNodes = currentSequenceNodes.filter(d => {
      if(uniquePositions.includes(d.position)) { return false; }
      uniquePositions.push(d.position)
      return true;
    })

    const newShifting: Dictionary<number> = {}
    uniquePositionNodes.forEach((currentNode) => {
      const connections = currentNode.connectionsX
      const connectedXNodes = uniquePositionNodes.filter(d => connections.map(d => d[0]).includes(d.id))
      if(connectedXNodes.length === 0) {return [previousShift, currentNode.position]}
      const previousNode = connectedXNodes[0]
      const distanceToPrevious = previousNode.position - currentNode.position
      const minimumDistance = -minimumAbsDistance
      
      if(distanceToPrevious > 0) { return [previousShift, currentNode.position] }
      if(previousNode.originalPosition === currentNode.originalPosition) {console.log('something is strange'); return [previousShift, currentNode.position]}
  
      const differenceToMinDistance = distanceToPrevious - minimumDistance
      // Shift only if differene to min diff is bigger than 0, which means it is too close
      const shift = Math.max(0, differenceToMinDistance)
      const newShift = previousShift + shift
      previousShift = newShift
      newShifting[String(currentNode.position)] = newShift 
    })
    
    return newShifting
  }

  export const applyMinimumdistance = (nodesOnSequence: GraphNode[], minimumAbsDistance: number) => {
    const deltaPosCorrection = minDistanceConstraintShift(nodesOnSequence, minimumAbsDistance)
    nodesOnSequence.forEach(node => {
      const newPosition = node.position + deltaPosCorrection[`${node.position}`]
      node.position = newPosition
    })
    return nodesOnSequence
  }