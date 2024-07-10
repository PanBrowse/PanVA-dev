import type { Dictionary } from "lodash"
import { abs } from "./math"
import { filterUniquePosition } from "./axisStretch"

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
  
    public set connectionsX(connections: xConnections) {this._connectionsX = connections}
    public set connectionsY(connections: string[]) {this._connectionsY = connections}
    public set position(newPos: number) { this._position = newPos }
  
  }

export const calculateAttractingForce = (distanceToNeighbour: number, expectedDistance: number) => {
    const differenceToExpectedDistance = distanceToNeighbour - expectedDistance
    if(differenceToExpectedDistance < 1) {return differenceToExpectedDistance}
    const force = (abs(differenceToExpectedDistance)/abs(expectedDistance) )
    const direction = Math.sign(expectedDistance)
    if(force <= 1) { return force * direction }
    return Math.log2(force) * direction / 100000
  }
  
  const calculateAttractingForceY = (distanceToNeighbour: number) => {
    if(abs(distanceToNeighbour) < 1 ) { return distanceToNeighbour }
    return  Math.log2(abs(distanceToNeighbour)) * Math.sign(distanceToNeighbour) * 100
  }
  
  const calculateRepellingForce = (distanceToNeighbour: number, expectedDistance: number) => {
    const percentageCompressed = 1 - (abs(distanceToNeighbour - expectedDistance) / abs(expectedDistance))
    const force = percentageCompressed * 100000
    const direction = -1 *  Math.sign(distanceToNeighbour)
    return  force * direction
}
  
  const calculateGravityForce = (distanceToNeighbour: number) => {
    if(distanceToNeighbour === 0 ) { return 0 }
    return Math.sqrt(abs(distanceToNeighbour)) * Math.sign(distanceToNeighbour)
  }
  
  const calculateNaturalRepellingForce = (distanceToNeighbour: number) => {
    if(distanceToNeighbour === 0 ) { return 0 }
    return -1/Math.pow(abs(distanceToNeighbour), 1/10) * Math.sign(distanceToNeighbour)
  }
  
export const evaluateForces = (currentNode:GraphNode, connectedXNodes: (GraphNode | undefined)[], connectedYNodes:GraphNode[], heat: number, excludedHomologyGroup?: number) => {
    let force = 0
    const scalePartialForceY = 1000
    const scalePartialForceX = 1
    const scalePartialForceGravity = 10
    const scaleRepelling = 10
    // Calculate contribution for all in the same homology group
    connectedYNodes.forEach(connectedNode => {
      const partialForce = calculateAttractingForceY(connectedNode.position - currentNode.position)
      if(currentNode.homologyGroup === excludedHomologyGroup) { force = force; console.log('excluded') }
      else { force = force + (partialForce * scalePartialForceY ) }
    })
  
    // calculate contribution from adjacent nodes
    let partialForce = 0
    connectedXNodes.forEach((connectedNode, i) => {
      if(connectedNode === undefined) {return}
      const neighbourDistance = connectedNode.position - currentNode.position
      const side = i === 0 ? 'left' : 'right'
      const connection = currentNode.connectionsX[side]
      const expectedNeighbourDistance = connection ? connection[1] : i * (-1)
  
      if(Math.sign(expectedNeighbourDistance) !== Math.sign(neighbourDistance)) {
            // if different signs: order flipped,  this should never happen
          partialForce = calculateAttractingForce(neighbourDistance, expectedNeighbourDistance)
          console.log('order flipped', expectedNeighbourDistance, neighbourDistance, heat)
        }
  
      else if(abs(neighbourDistance) < abs(expectedNeighbourDistance)) {
        partialForce = calculateRepellingForce(neighbourDistance, expectedNeighbourDistance) 
      } else {
        partialForce = calculateAttractingForce(neighbourDistance, expectedNeighbourDistance) 
      }
  
      //add a contracting force to condense the view and a repelling force to spread out nodes
      const gravityForce = calculateGravityForce(neighbourDistance)
      const repellingForce = calculateNaturalRepellingForce(neighbourDistance)
      force = force + (scalePartialForceX * partialForce) + (gravityForce * scalePartialForceGravity) + (repellingForce * scaleRepelling)
    })

    return force
  }
  
export const applyOrderConstraint = (currentNode: GraphNode, connectedXNodes: (GraphNode|undefined)[], deltaPosIn: number) => {
    const maxMove = 10000000
    let bounds = [-maxMove, maxMove]
    let deltaPos = deltaPosIn
  
    //calculate bounds
    const connectedRight = connectedXNodes[1]
    const connectedLeft = connectedXNodes[0]
    const previousDistanceRight = connectedRight ? connectedRight.position - currentNode.position : maxMove
    const previousDistanceLeft = connectedLeft ? connectedLeft.position - currentNode.position : -maxMove

    bounds[0] = previousDistanceLeft * 3 / 7
    bounds[1] = previousDistanceRight * 3 / 7

    //apply bounds
    if(deltaPos < 0) {
      deltaPos = Math.max(deltaPos, bounds[0])
    }
    else {
      deltaPos = Math.min(deltaPos, bounds[1])
    }

    return deltaPos
  }
  
  export const minDistanceConstraintShift = (currentSequenceNodes: GraphNode[] , minimumAbsoluteDistance: number): Dictionary<number> => {
    let accumulatedShift = 0
    //don't apply to nodes in the same position
    const uniquePositionNodes = filterUniquePosition(currentSequenceNodes)

    const shiftCoefficients: Dictionary<number> = {}
    uniquePositionNodes.forEach((currentNode) => {
      const precedingNode = currentNode.connectionsX.left ? currentSequenceNodes.find(d => d.id === currentNode.connectionsX.left![0]) : undefined
      if(precedingNode === undefined) { return shiftCoefficients[String(currentNode.originalPosition)] = accumulatedShift }
      const distanceToPreceding = precedingNode.position - currentNode.position
      const minimumDistance = -minimumAbsoluteDistance
      
      if(distanceToPreceding > 0) {console.log('wrong order of neighbours'); return shiftCoefficients[String(currentNode.originalPosition)] = accumulatedShift }
      if(precedingNode.originalPosition === currentNode.originalPosition) { console.log('positions are not unique'); return shiftCoefficients[String(currentNode.originalPosition)] = accumulatedShift }
      const differenceToMinDistance = distanceToPreceding - minimumDistance
      // Shift only if differene to min diff is bigger than 0, which means it is too close
      const shift = Math.max(0, differenceToMinDistance)
      accumulatedShift = accumulatedShift + shift
      shiftCoefficients[String(currentNode.originalPosition)] = accumulatedShift 
    })
    return shiftCoefficients
  }

  export const applyMinimumdistance = (nodesOnSequence: GraphNode[], minimumAbsDistance: number) => {
    const deltaPosCorrection = minDistanceConstraintShift(nodesOnSequence, minimumAbsDistance)
    nodesOnSequence.sort((a,b) => a.position- b.position).forEach(node => {
      const newPosition = node.position + deltaPosCorrection[`${node.originalPosition}`]
      node.position = newPosition
    })
    return nodesOnSequence
  }