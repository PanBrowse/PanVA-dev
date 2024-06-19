import type { GroupInfo, SequenceMetrics } from "@/types"
import * as d3 from 'd3'
import { abs, max, min } from "./math"

export const runForceSimulation = ( genes: GroupInfo[], sequences: SequenceMetrics[]) => {
    let heat = 1000
    let nodes: GraphNode[] = []
    let excludedHomologyGroup =0 // 232290464
 
    //genes to nodes
    genes.forEach((gene, index) => {
      // add index to get unique id
      const uId = gene.gene_id + index.toString()
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
        const deltaPosConstrained = applyOrderConstraint(node, connectedXNodes, deltaPos)
        const newPositionConstrained = node.position + deltaPosConstrained

        const updatedNode = new GraphNode(node.id, newPositionConstrained, node.homologyGroup, node.sequence, node.sequenceId, node.originalPosition)
        updatedNode.connectionsX = node.connectionsX
        updatedNode.connectionsY = node.connectionsY
        newUpdatedNodes.push(updatedNode)
      }
      //check for order changes
      newUpdatedNodes.forEach((node, i) => {
        node.connectionsX.forEach(connection => {
          const connectionNode = newUpdatedNodes.find(node => node.id === connection[0])
          if(connectionNode === undefined) { return }

          const currentDistance = connectionNode?.position - node.position
          const expectedDistance = connection[1]
          if(Math.sign(currentDistance) !== Math.sign(expectedDistance)) { console.log('unordered', heat) }
        })
      })

      nodes = newUpdatedNodes
    }

    while(true) {
      if(heat < 0.1) { return nodes }
      updateNodes( heat)
      heat = heat * 0.99
    }
  }


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

}


const calculateAttractingForce = (distanceToNeighbour: number, expectedDistance: number) => {
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

const evaluateForces = (currentNode:GraphNode, connectedXNodes: GraphNode[], connectedYNodes:GraphNode[], heat: number, excludedHomologyGroup?: number) => {
  let force = 0
  const scalePartialForceY = 1
  const scalePartialForceX = 10
  const scalePartialForceGravity = 1/10000
  // Calculate contribution for all in the same homology group
  connectedYNodes.forEach(connectedNode => {
    const partialForce = calculateAttractingForceY(connectedNode.position - currentNode.position)

    if(currentNode.homologyGroup === excludedHomologyGroup) { force = force }
    else { force = force + (partialForce * scalePartialForceY ) }
  })

  // calculate contribution from adjacent nodes
  let partialForce = 0
  connectedXNodes.forEach((connectedNode, i) => {
    const distanceToNeighbour = connectedNode.position - currentNode.position
    const expectedDistance = currentNode.connectionsX[i][1]

    if(Math.sign(expectedDistance) !== Math.sign(distanceToNeighbour)) {
          // if different signs: order flipped,  this should never happen
        partialForce = calculateAttractingForce(distanceToNeighbour, expectedDistance)
        console.log('order flipped', expectedDistance, distanceToNeighbour, heat)
      }
    else if(abs(distanceToNeighbour) < abs(expectedDistance)) {
      partialForce = calculateRepellingForce(distanceToNeighbour, expectedDistance)
    } else {
      partialForce = calculateAttractingForce(distanceToNeighbour, expectedDistance)
    }

    //add a contracting force to condense the view
    const gravityForce = calculateGravityForce(distanceToNeighbour)

    force = force + (scalePartialForceX * partialForce) + (gravityForce * scalePartialForceGravity)
  })
  return force
}

const applyOrderConstraint = (currentNode: GraphNode, connectedXNodes: GraphNode[], deltaPosIn: number) => {
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