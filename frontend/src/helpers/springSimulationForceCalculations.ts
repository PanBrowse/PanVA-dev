import { useGeneSetStore } from "@/stores/geneSet";
import { abs } from "./math";
import { GraphNode, GraphNodeGroup } from "./springSimulationUtils";
import { mapWritableState } from "pinia";


export const evaluateForcesY = (currentNode: GraphNode, connectedYNodes: GraphNode[], heat: number, excludedHomologyGroup?: number) => {
  let force = 0;
  const scalePartialForceY = 0.1;

  // Calculate contribution for all in the same homology group
  connectedYNodes.forEach(connectedNode => {
    const partialForce = calculateAttractingForceY((connectedNode.endPosition + connectedNode.position) / 2 - (currentNode.endPosition + currentNode.position) / 2);
    if (currentNode.homologyGroup === excludedHomologyGroup) { force = force; console.log('excluded'); }
    else { force = force + (partialForce * scalePartialForceY); }
  });

  return force;
};


export const evaluateForces = (
  currentNode: GraphNode | GraphNodeGroup,
  connectedXNodes: (GraphNode | GraphNodeGroup | undefined)[],
  connectedYNodes: (GraphNode | GraphNodeGroup)[],
  heat: number,
  excludedHomologyGroup?: number,
  print: boolean = false
): [number, number] => {
  /* Returns [forcesWithNormal, forces] */


  const parameters = mapWritableState(useGeneSetStore, [
    'scaleXForce',
    'scaleYForce',
    'scaleContraction',
    'scaleRepulsion',
    'minimumDistance'
  ]);


  // tune force contributions
  const scalePartialForceY = parameters.scaleYForce.get(); //connectedYNodes.length > 0 ? 1/connectedYNodes.length : 100
  const scalePartialForceX = parameters.scaleXForce.get();
  const scalePartialForceGravity = parameters.scaleContraction.get();
  const scaleRepelling = parameters.scaleRepulsion.get();
  const touchingDistance = parameters.minimumDistance.get();

  let forceOnNode: number = 0;
  // Calculate contribution for all nodes in the same homology group
  let homologyGroupTotal = 0;
  connectedYNodes.forEach(connectedNode => {
    const partialForce = calculateAttractingForceY(connectedNode.position - currentNode.position);
    { homologyGroupTotal = homologyGroupTotal + partialForce; }
  });

  // calculate contribution from adjacent nodes
  let dnaStringPartialForce = 0;
  let gravityTotal = 0;
  let repellingTotal = 0;
  let dnaStringTotal = 0;
  const nodesAreTouching = [false, false];

  connectedXNodes.forEach((connectedNode, i) => {
    if (connectedNode === undefined) { return; }
    const side = i === 0 ? 'left' : 'right';
    const neighbourDistance = side === "left" ? connectedNode.endPosition - currentNode.position : connectedNode.position - currentNode.endPosition;
    const connection = currentNode.connectionsX[side];
    const expectedNeighbourDistance = connection ? connection[1] : i * (-1);
    if (abs(neighbourDistance) <= touchingDistance) {
      nodesAreTouching[i] = true;
    }
    if (Math.sign(expectedNeighbourDistance) !== Math.sign(neighbourDistance)) {
      // if different signs: order flipped,  this should never happen
      dnaStringPartialForce = calculateAttractingForce(neighbourDistance, expectedNeighbourDistance, touchingDistance);
      console.log('order flipped', expectedNeighbourDistance, neighbourDistance);
    }
    else if (abs(neighbourDistance) < abs(expectedNeighbourDistance)) {
      dnaStringPartialForce = calculateRepellingForce(neighbourDistance, expectedNeighbourDistance);
    } else {
      dnaStringPartialForce = calculateAttractingForce(neighbourDistance, expectedNeighbourDistance, touchingDistance);
    }
    dnaStringTotal = dnaStringTotal + dnaStringPartialForce;

    const gravityForce = calculateGravityForce(neighbourDistance, touchingDistance);
    gravityTotal = gravityTotal + gravityForce;

    const repellingForce = calculateNaturalRepellingForce(neighbourDistance);
    repellingTotal = repellingTotal + repellingForce;
  });

  forceOnNode =
    (scalePartialForceX * dnaStringTotal)
    + (scalePartialForceGravity * gravityTotal)
    + (scaleRepelling * repellingTotal)
    + (scalePartialForceY * homologyGroupTotal);
  if (print) {
    console.log('force parts',);
    console.log('x', (scalePartialForceX * dnaStringTotal));
    console.log(
      'gravity', (scalePartialForceGravity * gravityTotal)
      , 'repell', (scaleRepelling * repellingTotal)
      , 'y', (scalePartialForceY * homologyGroupTotal));
  }

  let forceWithNormal = forceOnNode;
  nodesAreTouching.forEach((nodesAreTouching, i) => {
    const neighbourDirection = i === 0 ? -1 : 1;
    const forceDirection = Math.sign(forceWithNormal);
    if (nodesAreTouching && (neighbourDirection === forceDirection)) {
      forceWithNormal = 0;
    }
  });
  return [forceWithNormal, forceOnNode];
};

export const calculateAttractingForce = (distanceToNeighbour: number, expectedDistance: number, touchingDistance: number = 1000) => {
  const differenceToExpectedDistance = distanceToNeighbour - expectedDistance;
  if (abs(differenceToExpectedDistance) < 10) { return differenceToExpectedDistance; }
  if (expectedDistance === 0) { console.log('nodes should not be included'); return 0; }
  const force = (abs(differenceToExpectedDistance) / abs(expectedDistance));
  const direction = Math.sign(expectedDistance);
  if (force <= 1) { return force * direction; }
  return Math.log2(force) * direction * 10;
};

const calculateAttractingForceY = (distanceToNeighbour: number) => {
  if (abs(distanceToNeighbour) < 1) { return distanceToNeighbour; }
  const force = Math.log2(abs(distanceToNeighbour)) * 100;
  const direction = Math.sign(distanceToNeighbour);
  return force * direction;
};

const calculateRepellingForce = (distanceToNeighbour: number, expectedDistance: number) => {
  if (expectedDistance === 0) { console.log('two identical included'); return 0; }
  const percentageCompressed = (abs(distanceToNeighbour - expectedDistance) / abs(expectedDistance));
  const force = percentageCompressed * 10 / Math.log2(Math.ceil(abs(distanceToNeighbour / 100)) + 1);
  const direction = -1 * Math.sign(distanceToNeighbour);
  return force * direction;
};

const calculateGravityForce = (distanceToNeighbour: number, minimumDistance: number = 1) => {
  if (abs(distanceToNeighbour) === 0) { return 0; }
  const force = Math.sqrt(abs(distanceToNeighbour));
  const direction = Math.sign(distanceToNeighbour);
  return force * direction;
};

const calculateNaturalRepellingForce = (distanceToNeighbour: number) => {
  if (distanceToNeighbour === 0) { return 0; }
  const scale = 100;
  return -1 / Math.pow(abs(distanceToNeighbour), 1 / 2) * Math.sign(distanceToNeighbour) * scale;
};

export const findNormalForces = (group: GraphNodeGroup, allGroups: GraphNodeGroup[], touchingDistance: number = 1000) => {

  const touchingLeft = findTouchingNeighboursLeft(group, allGroups, touchingDistance);
  const touchingRight = findTouchingNeighboursRight(group, allGroups, touchingDistance);

  // For right nodes
  let totalRightForce = 0;
  touchingRight.sort((a, b) => b.position - a.position).forEach(neighbourGroup => {
    const connectedXNodes = findNeighgourNodes(neighbourGroup, allGroups);
    const connectedYNodes = allGroups.filter(d => neighbourGroup.connectionsY.includes(d.id));
    const [forceWithNormal, forceContribution] = evaluateForces(neighbourGroup, connectedXNodes, connectedYNodes, 1, undefined, false);
    const updatedTotalRight = totalRightForce + forceContribution;
    totalRightForce = Math.min(updatedTotalRight, 0);
  });
  // For left nodes
  let totalLeftForce = 0;
  touchingLeft.sort((a, b) => a.position - b.position).forEach(neighbourGroup => {
    const connectedXNodes = findNeighgourNodes(neighbourGroup, allGroups);
    const connectedYNodes = allGroups.filter(d => neighbourGroup.connectionsY.includes(d.id));
    const [forceWithNormal, forceContribution] = evaluateForces(neighbourGroup, connectedXNodes, connectedYNodes, 1, undefined, false);
    const updatedTotalLeft = totalLeftForce + forceContribution;
    totalLeftForce = Math.max(updatedTotalLeft, 0);
  });

  return [totalLeftForce, totalRightForce];
};

const findTouchingNeighboursLeft = (group: GraphNodeGroup, nodeGroups: GraphNodeGroup[], touchingDistance: number = 1000): GraphNodeGroup[] => {
  const [leftNeighbour, rightNeighbour] = findNeighgourNodes(group, nodeGroups);
  if (leftNeighbour === undefined) { return []; }
  if (group.position - leftNeighbour.endPosition > touchingDistance) { return []; }
  else {
    return [group, ...findTouchingNeighboursLeft(leftNeighbour, nodeGroups)];
  }
};

const findTouchingNeighboursRight = (group: GraphNodeGroup, nodeGroups: GraphNodeGroup[], touchingDistance: number = 1000): GraphNodeGroup[] => {
  const [leftNeighbour, rightNeighbour] = findNeighgourNodes(group, nodeGroups);
  if (rightNeighbour === undefined) { return []; }
  if (rightNeighbour.position - group.endPosition > touchingDistance) { return []; }
  else {
    return [group, ...findTouchingNeighboursRight(rightNeighbour, nodeGroups)];
  }
};

export const findNeighgourNodes = (group: GraphNodeGroup, nodeGroups: GraphNodeGroup[]) => {
  if (group.connectionsX === undefined) { return [undefined, undefined]; }
  const leftNeighbourId = group.connectionsX.left ? group.connectionsX.left[0] : undefined;
  const rightNeighbourId = group.connectionsX.right ? group.connectionsX.right[0] : undefined;

  const leftNeighbour = leftNeighbourId ? nodeGroups.find(d => d.id === leftNeighbourId) : undefined;
  const rightNeighbour = rightNeighbourId ? nodeGroups.find(d => d.id === rightNeighbourId) : undefined;
  const connectedXNodes = [leftNeighbour, rightNeighbour];
  return connectedXNodes;
};
