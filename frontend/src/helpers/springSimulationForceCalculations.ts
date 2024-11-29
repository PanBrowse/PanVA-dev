import { useGeneSetStore } from "@/stores/geneSet";
import { abs } from "./math";
import { GraphNode, GraphNodeGroup, type SpringTuningParameters } from "./springSimulationUtils";
import { mapWritableState } from "pinia";
import { TRANSITION_SEQUENCES_THRESHOLD } from "@/constants";


export const evaluateForcesY = (currentNode: GraphNode, connectedYNodes: GraphNode[], heat: number, excludedHomologyGroup?: string) => {
  let force = 0;
  const scalePartialForceY = 0.1;

  // Calculate contribution for all in the same homology group
  connectedYNodes.forEach(connectedNode => {
    const partialForce = calculateAttractingForceY((connectedNode.endPosition + connectedNode.startPosition) / 2 - (currentNode.endPosition + currentNode.startPosition) / 2);
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
  springTuning: SpringTuningParameters,
  excludedHomologyGroup?: number,
  print: boolean = false,

): [number, number] => {
  /* Returns [forcesWithNormal, forces] */


  // const parameters = mapWritableState(useGeneSetStore, [
  //   'scaleXForce',
  //   'scaleYForce',
  //   'scaleContraction',
  //   'scaleRepulsion',
  //   'minimumDistance'
  // ]);


  // tune force contributions
  // const scalePartialForceY = parameters.scaleYForce.get(); //connectedYNodes.length > 0 ? 1/connectedYNodes.length : 100
  // const scalePartialForceX = parameters.scaleXForce.get();
  // const scalePartialForceGravity = parameters.scaleContraction.get();
  // const scaleRepelling = parameters.scaleRepulsion.get();
  // const touchingDistance = parameters.minimumDistance.get();

  const scalePartialForceY = springTuning.scaleYForce; //connectedYNodes.length > 0 ? 1/connectedYNodes.length : 100
  const scalePartialForceX = springTuning.scaleXForce;
  const scalePartialForceGravity = springTuning.scaleContraction;
  const scaleRepelling = springTuning.scaleRepulsion;
  const touchingDistance = springTuning.minimumDistance;

  let forceOnNode: number = 0;
  // Calculate contribution for all nodes in the same homology group
  let homologyGroupTotal = 0;
  connectedYNodes.forEach(connectedNode => {
    const partialForce = calculateAttractingForceY(connectedNode.startPosition - currentNode.startPosition);
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
    const neighbourDistance = side === "left" ? connectedNode.endPosition - currentNode.startPosition : connectedNode.startPosition - currentNode.endPosition;
    const connection = currentNode.connectionsX[side];
    const expectedNeighbourDistance = connection ? connection[1] : i * (-1);
    if (abs(neighbourDistance) <= touchingDistance) {
      nodesAreTouching[i] = true;
    }
    if (Math.sign(expectedNeighbourDistance) !== Math.sign(neighbourDistance)) {
      // if different signs: order flipped,  this should never happen
      dnaStringPartialForce = calculateAttractingForce(neighbourDistance, expectedNeighbourDistance, touchingDistance);
      console.log('order flipped', expectedNeighbourDistance, neighbourDistance, currentNode.id);
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

  let forceWithNormal = forceOnNode;
  nodesAreTouching.forEach((nodesAreTouching, i) => {
    const neighbourDirection = i === 0 ? -1 : 1;
    const forceDirection = Math.sign(forceWithNormal);
    if (nodesAreTouching && (neighbourDirection === forceDirection)) {
      forceWithNormal = 0;
    }
  });
  if (false) {
    console.log('force parts',);
    console.log('x', (scalePartialForceX * dnaStringTotal));
    console.log(
      'gravity', (scalePartialForceGravity * gravityTotal)
      , 'repell', (scaleRepelling * repellingTotal)
      , 'y', (scalePartialForceY * homologyGroupTotal));
    // console.log('with normal:', forceWithNormal);
    console.log('on node:', forceOnNode);
  }

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
  const force = Math.log2(abs(distanceToNeighbour)) * 10;
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
  const scale = 1000;
  return -1 / Math.pow(abs(distanceToNeighbour), 1 / 10) * Math.sign(distanceToNeighbour) * scale;
};


export const findNormalForces = (
  group: GraphNodeGroup,
  allGroups: GraphNodeGroup[],
  springTuning: SpringTuningParameters,
  touchingDistance: number = 1000,
  maxDepth: number | undefined = undefined
) => {

  const touchingLeft = findTouchingNeighboursLeft(
    group,
    allGroups,
    touchingDistance,
    0,
    maxDepth
  );
  const touchingRight = findTouchingNeighboursRight(
    group,
    allGroups,
    touchingDistance,
    0,
    maxDepth
  );

  // For right nodes
  let totalRightForce = 0;
  touchingRight.sort((a, b) => b.startPosition - a.startPosition).forEach(neighbourGroup => {
    const connectedXNodes = findNeighbourNodes(neighbourGroup, allGroups);
    // const connectedYNodes = allGroups.filter(d => neighbourGroup.connectionsY.includes(d.id));

    const connectionsYSet = new Set(neighbourGroup.connectionsY);
    const connectedYNodes = allGroups.filter(d => connectionsYSet.has(d.id));
    const [forceWithNormal, forceContribution] = evaluateForces(neighbourGroup, connectedXNodes, connectedYNodes, 1, springTuning, undefined, false);
    const updatedTotalRight = totalRightForce + forceContribution;
    totalRightForce = Math.min(updatedTotalRight, 0);
  });
  // For left nodes
  let totalLeftForce = 0;
  touchingLeft.sort((a, b) => a.startPosition - b.startPosition).forEach(neighbourGroup => {
    const connectedXNodes = findNeighbourNodes(neighbourGroup, allGroups);
    const connectionsYSet = new Set(neighbourGroup.connectionsY);
    const connectedYNodes = allGroups.filter(d => connectionsYSet.has(d.id));
    // const connectedYNodes = allGroups.filter(d => neighbourGroup.connectionsY.includes(d.id));
    const [forceWithNormal, forceContribution] = evaluateForces(neighbourGroup, connectedXNodes, connectedYNodes, 1, springTuning, undefined, false);
    const updatedTotalLeft = totalLeftForce + forceContribution;
    totalLeftForce = Math.max(updatedTotalLeft, 0);
  });
  return [totalLeftForce, totalRightForce];
};

const findTouchingNeighboursLeft = (
  group: GraphNodeGroup,
  nodeGroups: GraphNodeGroup[],
  touchingDistance: number = 1000,
  depth: number = 0,
  maxDepth: number | undefined = undefined
): GraphNodeGroup[] => {
  if (maxDepth && depth >= maxDepth) { return []; }
  const [leftNeighbour, _] = findNeighbourNodes(group, nodeGroups);
  if (leftNeighbour === undefined) { return []; }
  if (group.startPosition - leftNeighbour.endPosition > touchingDistance) { return []; }
  else {
    return [group, ...findTouchingNeighboursLeft(
      leftNeighbour,
      nodeGroups,
      touchingDistance,
      depth + 1,
      maxDepth
    )];
  }
};

const findTouchingNeighboursRight = (
  group: GraphNodeGroup,
  nodeGroups: GraphNodeGroup[],
  touchingDistance: number = 1000,
  depth: number = 0,
  maxDepth: number | undefined = undefined
): GraphNodeGroup[] => {
  if (maxDepth && depth >= maxDepth) { return []; }
  const [_, rightNeighbour] = findNeighbourNodes(group, nodeGroups);
  if (rightNeighbour === undefined) { return []; }
  if (rightNeighbour.startPosition - group.endPosition > touchingDistance) { return []; }
  else {
    return [group, ...findTouchingNeighboursRight(
      rightNeighbour,
      nodeGroups,
      touchingDistance,
      depth + 1,
      maxDepth
    )];
  }
};

export const findNeighbourNodes = (group: GraphNodeGroup, nodeGroups: GraphNodeGroup[]) => {
  if (group.connectionsX === undefined) { return [undefined, undefined]; }
  // const leftNeighbourId = group.connectionsX.left ? group.connectionsX.left[0] : undefined;
  // const rightNeighbourId = group.connectionsX.right ? group.connectionsX.right[0] : undefined;
  const { left, right } = group.connectionsX;
  const leftNeighbourId = left?.[0];
  const rightNeighbourId = right?.[0];

  const leftNeighbour = nodeGroups.find(d => d.id === leftNeighbourId);
  const rightNeighbour = nodeGroups.find(d => d.id === rightNeighbourId);
  const connectedXNodes = [leftNeighbour, rightNeighbour];
  return connectedXNodes;
};
