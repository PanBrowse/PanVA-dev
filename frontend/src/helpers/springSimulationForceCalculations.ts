import { abs } from "./math"
import { GraphNode, GraphNodeGroup } from "./springSimulationUtils"

export const evaluateForcesY = (currentNode:GraphNode, connectedYNodes:GraphNode[], heat: number, excludedHomologyGroup?: number) => {
    let force = 0
    const scalePartialForceY = 1000

    // Calculate contribution for all in the same homology group
    connectedYNodes.forEach(connectedNode => {
      const partialForce = calculateAttractingForceY(connectedNode.position - currentNode.position)
      if(currentNode.homologyGroup === excludedHomologyGroup) { force = force; console.log('excluded') }
      else { force = force + (partialForce * scalePartialForceY ) }
    })
  
    return force
  }


  export const evaluateForces = (currentNode:GraphNode|GraphNodeGroup, connectedXNodes: (GraphNode | GraphNodeGroup | undefined)[], connectedYNodes:(GraphNode|GraphNodeGroup)[], heat: number, excludedHomologyGroup?: number): [number, number] => {
    // tune force contributions
    const scalePartialForceY = 10000
    const scalePartialForceX = 10
    const scalePartialForceGravity = scalePartialForceX * 100000
    const scaleRepelling = 10
    const touchingDistance = 100

    let forceOnNode:number = 0
    // Calculate contribution for all in the same homology group
    let homologyGroupTotal = 0
    connectedYNodes.forEach(connectedNode => {
    const partialForce = calculateAttractingForceY(connectedNode.position - currentNode.position)
        { homologyGroupTotal = homologyGroupTotal + partialForce}
    })

    // calculate contribution from adjacent nodes
    let partialForce = 0
    let gravityTotal = 0
    let repellingTotal = 0
    let dnaStringTotal = 0
    const nodesAreTouching = [false, false]
    connectedXNodes.forEach((connectedNode, i) => {
    if(connectedNode === undefined) {return}
    const side = i === 0 ? 'left' : 'right'
    const neighbourDistance = side === "left" ? connectedNode.endPosition - currentNode.position : connectedNode.position - currentNode.endPosition
    const connection = currentNode.connectionsX[side]
    const expectedNeighbourDistance = connection ? connection[1] : i * (-1)
    if(abs(neighbourDistance) <= touchingDistance ) {
        nodesAreTouching[i] = true
    }
    if(Math.sign(expectedNeighbourDistance) !== Math.sign(neighbourDistance)) {
            // if different signs: order flipped,  this should never happen
        partialForce = calculateAttractingForce(neighbourDistance, expectedNeighbourDistance)
        console.log('order flipped', expectedNeighbourDistance, neighbourDistance, heat)
        }
    else if(abs(neighbourDistance) < abs(expectedNeighbourDistance)) {
        partialForce = calculateRepellingForce(neighbourDistance, expectedNeighbourDistance) 
    } else {
        partialForce = calculateAttractingForce(neighbourDistance, expectedNeighbourDistance, touchingDistance) 
    }
    dnaStringTotal = dnaStringTotal + partialForce

    const gravityForce = calculateGravityForce(neighbourDistance, touchingDistance)
    gravityTotal = gravityTotal + gravityForce

    const repellingForce = calculateNaturalRepellingForce(neighbourDistance)
    repellingTotal = repellingTotal + repellingForce
    })

    forceOnNode = 
    (scalePartialForceX * dnaStringTotal) 
    + (scalePartialForceGravity * gravityTotal) 
    + (scaleRepelling * repellingTotal)
    + (scalePartialForceY * homologyGroupTotal)

    let forceWithNormal = forceOnNode
    nodesAreTouching.forEach((neighbourIsTooClose, i) => {
    const neighbourDirection = i === 0 ? -1 : 1
    const forceDirection = Math.sign(forceWithNormal)

    if(neighbourIsTooClose && (neighbourDirection === forceDirection) ) {
        forceWithNormal = 0
    }
    })
    return [forceWithNormal, forceOnNode]
}

export const calculateAttractingForce = (distanceToNeighbour: number, expectedDistance: number, touchingDistance:number=1) => {
    const differenceToExpectedDistance = distanceToNeighbour - expectedDistance
    if(abs(differenceToExpectedDistance) < 10) {return differenceToExpectedDistance}
    if(expectedDistance === 0 ) {console.log('nodes should not be included'); return 0}
    const force = (abs(differenceToExpectedDistance)/abs(expectedDistance) )
    const direction = Math.sign(expectedDistance)
    if(force <= 1) { return force * direction  }
    return Math.log2(force) * direction / 100000
}
    
const calculateAttractingForceY = (distanceToNeighbour: number) => {
    if(abs(distanceToNeighbour) < 1 ) { return distanceToNeighbour }
    const force = Math.log2(abs(distanceToNeighbour)) * 100
    const direction = Math.sign(distanceToNeighbour)
    return  force * direction
}
    
const calculateRepellingForce = (distanceToNeighbour: number, expectedDistance: number) => {
    if(expectedDistance === 0) {console.log('two identical included'); return 0}
    const percentageCompressed = 1 - (abs(distanceToNeighbour - expectedDistance) / abs(expectedDistance))
    const force = percentageCompressed * 100000
    const direction = -1 *  Math.sign(distanceToNeighbour)
    return  force * direction
}
    
const calculateGravityForce = (distanceToNeighbour: number, minimumDistance:number=1) => {
    if(abs(distanceToNeighbour) === 0 ) { return 0 }
    const force = Math.sqrt(abs(distanceToNeighbour))
    const direction = Math.sign(distanceToNeighbour)
    return force * direction
}
    
const calculateNaturalRepellingForce = (distanceToNeighbour: number) => {
    if(distanceToNeighbour === 0 ) { return 0 }
    return -1/Math.pow(abs(distanceToNeighbour), 1/10) * Math.sign(distanceToNeighbour)
}
    