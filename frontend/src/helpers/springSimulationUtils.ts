import { type Dictionary } from 'lodash';

import type { Gene } from '@/types';

import { filterUniquePosition } from './axisStretch';
import { abs } from './math';
import {
  evaluateForces,
  findNeighbourNodes,
  findNormalForces,

} from './springSimulationForceCalculations';
import { arrayRange } from './arrayRange';

export interface xConnections {
  left: [id: string, distance: number] | undefined;
  right: [id: string, distance: number] | undefined;
}

export interface SpringTuningParameters {
  scaleXForce: number,
  scaleYForce: number,
  scaleContraction: number,
  scaleRepulsion: number,
  minimumDistance: number,
}
export class GraphNode {
  private _id: string;
  private _position: number;
  private _homologyGroup: string;
  private _connectionsX: xConnections = { left: undefined, right: undefined };
  private _connectionsY: string[] = [];
  private _sequenceId: string;
  private _originalPosition: number;
  private _lastMove: number = 0;
  private _localTempScaling: number = 1;
  private _width: number;

  constructor(
    id: string,
    position: number,
    endPosition: number,
    homologyGroup: string,
    sequenceId: string,
    originalPosition?: number
  ) {
    ; (this._id = id), (this._position = position);
    this._homologyGroup = homologyGroup;
    this._sequenceId = sequenceId;
    this._originalPosition = originalPosition ?? position;
    this._width = endPosition - position;
  }

  public get id() {
    return this._id;
  }
  public get startPosition() {
    return this._position;
  }
  public get endPosition() {
    return this._width + this.startPosition;
  }
  public get originalPosition() {
    return this._originalPosition;
  }
  // public get sequence() {
  //   return this._sequence;
  // }
  public get sequenceId() {
    return this._sequenceId;
  }
  public get homologyGroup() {
    return this._homologyGroup;
  }
  public get connectionsX() {
    return this._connectionsX;
  }
  public get connectionsY() {
    return this._connectionsY;
  }
  public get lastMove() {
    return this._lastMove;
  }
  public get localTempScaling() {
    return this._localTempScaling;
  }
  public get width() {
    return this._width;
  }
  public get range() {
    return [this.startPosition, this.startPosition + this.width] as [number, number];
  }

  public set connectionsX(connections: xConnections) {
    this._connectionsX = connections;
  }
  public set connectionsY(connections: string[]) {
    this._connectionsY = connections;
  }
  public set startPosition(newPos: number) {
    this._position = newPos;
  }
  public set width(newWidth: number) {
    this._width = newWidth;
  }
  public set lastMove(newMove: number) {
    this._lastMove = newMove;
  }
  public set localTempScaling(newScale: number) {
    this._localTempScaling = Math.abs(newScale);
  }
}

export class GraphNodeGroup {
  private _nodes: GraphNode[];
  private _originalRange: [number, number];
  private _xConnections: xConnections;
  private _yConnections: string[];
  private _id: string;
  private _lastMove: number;
  private _localTempScaling: number;

  constructor(
    nodes: GraphNode[],
    originalRange?: [number, number],
    id?: string,
    xConnections?: xConnections,
    yConnections?: string[],
    lastMove?: number,
    localTempScaling?: number
  ) {
    const newNodes: GraphNode[] = [];
    nodes.forEach((node) => {
      const newNode = new GraphNode(
        node.id,
        node.startPosition,
        node.endPosition,
        node.homologyGroup,
        node.sequenceId,
        node.originalPosition
      );
      newNode.connectionsX = node.connectionsX;
      newNode.connectionsY = node.connectionsY;
      newNode.lastMove = node.lastMove;
      newNode.localTempScaling = node.localTempScaling;
      newNodes.push(newNode);
    });
    newNodes.sort((a, b) => a.startPosition - b.startPosition);
    this._nodes = newNodes;
    this._originalRange = originalRange ?? calculateRange(nodes);
    this._id = id ?? nodes[0].id + 'group';
    this._xConnections = xConnections ?? { left: undefined, right: undefined };
    this._yConnections = yConnections ?? [];
    this._lastMove = lastMove ?? 0;
    this._localTempScaling = localTempScaling ?? 1;
  }

  public get nodes() {
    return this._nodes;
  }
  public get homologyGroups() {
    return this._nodes.map((node) => node.homologyGroup);
  }
  public get range() {
    return calculateRange(this._nodes);
  }
  public get originalRange() {
    return this._originalRange;
  }
  public get originalPosition() {
    return this._originalRange[0];
  }
  public get startPosition() {
    return this._nodes[0].startPosition;
  }
  public get endPosition() {
    return this._nodes[this._nodes.length - 1].endPosition;
  }
  public get connectionsX() {
    return this._xConnections;
  }
  public get connectionsY() {
    return this._yConnections;
  }
  public get id() {
    return this._id;
  }
  public get nodeIds() {
    return this._nodes.map((d) => d.id);
  }
  public get sequenceId() {
    return this._nodes[0].sequenceId;
  }
  public get lastMove() {
    return this._lastMove;
  }
  public get localTempScaling() {
    return this._localTempScaling;
  }
  public get width() {
    return this.range[1] - this.range[0];
  }

  // public set range(newRange: [number, number]) {this._range = newRange}
  public set originalRange(newRange: [number, number]) {
    this._originalRange = newRange;
  }
  public set startPosition(newPosition: number) {
    const oldEnd = this.endPosition;
    const oldStart = this.startPosition;
    const newStart = newPosition;

    // update nodes as well
    this._nodes.forEach((node) => {
      const nodeOffsetWithinGroup: number = node.startPosition - oldStart;
      node.startPosition = newStart + nodeOffsetWithinGroup;
    });
  }
  public set connectionsX(newConnections: xConnections) {
    this._xConnections = newConnections;
  }
  public set connectionsY(newConnections: string[]) {
    this._yConnections = newConnections;
  }
  public set lastMove(newMove: number) {
    this._lastMove = newMove;
  }
  public set localTempScaling(newScale: number) {
    this._localTempScaling = Math.abs(newScale);
  }

  public addNode(newNode: GraphNode) {
    this._nodes.push(newNode);
    this._nodes.sort((a, b) => a.startPosition - b.startPosition);
    this.originalRange = calculateRange(this._nodes);
  }
}

export const applyOrderConstraint = (
  currentNode: GraphNode | GraphNodeGroup,
  connectedXNodes: (GraphNode | GraphNodeGroup | undefined)[],
  deltaPosIn: number,
  heat: number,
  touchingDistance: number = 1000
) => {
  // maximum allowed move depends on the heat (Davidson and Harel)
  const maxMove = 10 * heat;
  const bounds = [-maxMove, maxMove];
  let deltaPos: number = deltaPosIn;
  //calculate bounds
  const connectedRight = connectedXNodes[1];
  const connectedLeft = connectedXNodes[0];
  const previousDistanceLeft = connectedLeft
    ? connectedLeft.endPosition - currentNode.startPosition
    : -maxMove;
  const previousDistanceRight = connectedRight
    ? connectedRight.startPosition - currentNode.endPosition
    : maxMove;

  bounds[0] = Math.max(previousDistanceLeft + touchingDistance, -maxMove);
  bounds[1] = Math.min(previousDistanceRight - touchingDistance, maxMove);

  //apply bounds
  if (deltaPos === 0) { return deltaPos; }
  if (deltaPos < 0) {
    deltaPos = Math.max(deltaPos, bounds[0]);
  } else {
    deltaPos = Math.min(deltaPos, bounds[1]);
  }
  return deltaPos;
};

export const calculateShiftMinDist = (
  currentSequenceNodes: (GraphNode | GraphNodeGroup)[],
  minimumAbsoluteDistance: number
): Dictionary<number> => {
  let accumulatedShift = 0;
  //don't apply to nodes in the same position
  const uniquePositionNodes = filterUniquePosition(currentSequenceNodes);
  const shiftCoefficients: Dictionary<number> = {};

  uniquePositionNodes.forEach((currentNode) => {
    const precedingNode = currentNode.connectionsX.left
      ? currentSequenceNodes.find(
        (d) => d.id === currentNode.connectionsX.left![0]
      )
      : undefined;
    if (precedingNode === undefined) {
      return (shiftCoefficients[String(currentNode.originalPosition)] =
        accumulatedShift);
    }
    const distanceToPreceding = precedingNode.endPosition - currentNode.startPosition;
    const minimumDistance = -minimumAbsoluteDistance;

    const differenceToMinDistance = distanceToPreceding - minimumDistance;
    // Shift only if differene to min diff is bigger than 0, which means it is too close
    const shift = Math.max(0, differenceToMinDistance);
    accumulatedShift = accumulatedShift + shift;
    shiftCoefficients[String(currentNode.originalPosition)] = accumulatedShift;
  });
  return shiftCoefficients;
};

export const applyMinimumdistanceOnSequence = (
  nodesOnSequence: (GraphNode | GraphNodeGroup)[],
  minimumAbsDistance: number
) => {
  const sorted = nodesOnSequence.sort(
    (a, b) => a.originalPosition - b.originalPosition
  );
  const deltaPosCorrection = calculateShiftMinDist(sorted, minimumAbsDistance);

  sorted.forEach((node) => {
    const newPosition =
      node.startPosition + deltaPosCorrection[`${node.originalPosition}`];
    node.startPosition = newPosition;
  });
  return sorted;
};

const calculateRange = (nodes: GraphNode[]): [number, number] => {
  if (nodes.length === 0) {
    return [0, 0] as [number, number];
  }
  // const positions = nodes
  //   .flatMap((node) => [node.position, node.endPosition])
  //   .sort((a, b) => a - b);
  // return [positions[0], positions[positions.length - 1]] as [number, number];
  // return [nodes[0].position, nodes[nodes.length - 1].endPosition];


  const endPositions = nodes.reduce((acc: number[], node) => {
    acc.push(node.endPosition);
    return acc;
  }, []).sort((a, b) => a - b);

  return [nodes[0].startPosition, endPositions[endPositions.length - 1]] as [number, number];


};

export const rangesOverlap = (
  range1: [number, number],
  range2: [number, number]
): boolean => {
  const overlaps = true;
  if (range1[1] < range2[0]) {
    return false;
  }
  if (range2[1] < range1[0]) {
    return false;
  }
  return overlaps;
};

export const createNodeGroups = (nodes: GraphNode[]): GraphNodeGroup[] => {
  const uniqueSequences: string[] = [];
  nodes
    .map((d) => d.sequenceId)
    .forEach((d) => {
      if (uniqueSequences.includes(d)) {
        return;
      }
      uniqueSequences.push(d);
    });

  const groups: GraphNodeGroup[] = [];
  uniqueSequences.forEach((currentSequence) => {
    const groupsInSequence: GraphNodeGroup[] = [];
    const nodesInSequence: GraphNode[] = nodes.filter(
      (node) => node.sequenceId === currentSequence
    );
    if (nodesInSequence.length === 0) {
      return [];
    }

    nodesInSequence.forEach((node) => {
      if (groupsInSequence.length === 0) {
        groupsInSequence.push(new GraphNodeGroup([node]));
      } else if (
        rangesOverlap(
          node.range,
          groupsInSequence[groupsInSequence.length - 1].range
        )
      ) {
        groupsInSequence[groupsInSequence.length - 1].addNode(node);
      } else {
        groupsInSequence.push(new GraphNodeGroup([node]));
      }
    });
    groups.push(...groupsInSequence);
  });

  addXConnections(groups);
  addYConnections(groups);
  return groups;
};

export const addXConnections = (nodeGroups: (GraphNodeGroup | GraphNode)[]) => {
  const sortedNodeGroups = nodeGroups.sort((a, b) => a.startPosition - b.startPosition);
  sortedNodeGroups.forEach((currentGroup, i) => {
    const nodesOnSameSequence = sortedNodeGroups.filter(
      (d) => d.sequenceId === currentGroup.sequenceId
    );
    const currentGroupIndex = nodesOnSameSequence.findIndex(
      (d) => d.id === currentGroup.id
    );
    const leftGroupConnection =
      currentGroupIndex === 0
        ? undefined
        : nodesOnSameSequence[currentGroupIndex - 1];
    const rightGroupConnection =
      currentGroupIndex > nodesOnSameSequence.length - 2
        ? undefined
        : nodesOnSameSequence[currentGroupIndex + 1];

    const leftConnection: [string, number] | undefined =
      leftGroupConnection === undefined
        ? undefined
        : [
          leftGroupConnection.id,
          leftGroupConnection.endPosition - currentGroup.startPosition,
        ];
    const rightConnection: [string, number] | undefined =
      rightGroupConnection === undefined
        ? undefined
        : [
          rightGroupConnection.id,
          rightGroupConnection.startPosition - currentGroup.endPosition,
        ];
    currentGroup.connectionsX = { left: leftConnection, right: rightConnection };
  });
  return sortedNodeGroups;
};

export const addYConnections = (nodeGroups: GraphNodeGroup[]) => {
  nodeGroups.forEach((group) => {
    const yConnections = group.nodes.flatMap((node) => node.connectionsY);
    const yConnectionsGroup: string[] = [];
    yConnections.forEach((d) => {
      const dSet = new Set([d]);
      const neighbour = nodeGroups.find((group) => group.nodeIds.some(id => dSet.has(id)));

      // const neighbour = nodeGroups.find((group) => group.nodeIds.includes(d));
      if (neighbour !== undefined) {
        yConnectionsGroup.push(neighbour.id);
      }
    });
    group.connectionsY = yConnectionsGroup;
  });

  return nodeGroups;
};

export const genesToNodes = (genes: Gene[]) => {
  // Convert genes to graphNodes
  const nodes: GraphNode[] = [];
  genes.forEach((gene, index) => {
    // const uId = gene.gene_id + '_' + index.toString() // add index to get unique id
    nodes.push(
      new GraphNode(
        gene.uid,
        gene.start,
        gene.end,
        gene.homology_groups?.[0]?.uid,
        gene.sequence_uid ?? '',
      )
    );
  });
  nodes.sort((d, b) => d.startPosition - b.startPosition);

  // assign connections
  addXConnections(nodes);
  nodes.forEach((currentGroup) => {
    const yConnections = nodes
      .filter((d) => d.homologyGroup === currentGroup.homologyGroup)
      .map((d) => d.id);
    currentGroup.connectionsY = yConnections;
  });
  return nodes;
};

export const checkNodeOrder = (newNodes: GraphNodeGroup[]) => {
  newNodes.forEach((node, i) => {
    ;[node.connectionsX.left, node.connectionsX.right].forEach(
      (connection, index) => {
        if (connection === undefined) {
          return;
        }
        const connectionNode = newNodes.find(
          (node) => node.id === connection[0]
        );
        if (connectionNode === undefined) {
          return;
        }

        const currentDistance = connectionNode.endPosition - node.startPosition;
        const expectedDistance = connection[1];
        if (Math.sign(currentDistance) !== Math.sign(expectedDistance)) {
          console.log('unordered', i, index);
        }
      }
    );
  });
};

export const enforceMinimumDistance = (
  inputNodes: GraphNodeGroup[],
  minimumDistance: number
) => {
  const newNodes: GraphNodeGroup[] = [];
  const uniqueSequences: string[] = [];
  inputNodes
    .map((d) => d.sequenceId)
    .forEach((d) => {
      if (uniqueSequences.includes(d)) {
        return;
      }
      uniqueSequences.push(d);
    });
  uniqueSequences.forEach((sequence) => {
    const currentSequence = sequence;
    const nodesOnSequence = inputNodes.filter(
      (d) => d.sequenceId === currentSequence
    );
    const spreadNodes = applyMinimumdistanceOnSequence(
      nodesOnSequence,
      minimumDistance
    ) as GraphNodeGroup[];
    newNodes.push(...spreadNodes);
  });
  return newNodes;
};

// export const enforceMinimumDistance = (
//   inputNodes: GraphNodeGroup[],
//   minimumDistance: number
// ) => {
//   const newNodes: GraphNodeGroup[] = [];
//   const uniqueSequences: string[] = [];
//   inputNodes
//     .map((d) => d.sequenceId)
//     .forEach((d) => {
//       if (uniqueSequences.includes(d)) {
//         return;
//       }
//       uniqueSequences.push(d);
//     });
//   uniqueSequences.forEach((sequence) => {
//     const currentSequence = sequence;
//     const nodesOnSequence = inputNodes.filter(
//       (d) => d.sequenceId === currentSequence
//     );
//     const spreadNodes = applyMinimumdistanceOnSequence(
//       nodesOnSequence,
//       minimumDistance
//     ) as GraphNodeGroup[];
//     newNodes.push(...spreadNodes);
//   });
//   return newNodes;
// };

export const updateHighStressNodeGroup = (
  nodeGroups: GraphNodeGroup[],
  heat: number,
  springTuning: SpringTuningParameters,
  excludedHomologyGroup: number = 0,
  touchingDistance: number = 1000,
  maxNodeSpread: number | undefined = undefined
): [GraphNodeGroup[], boolean] => {
  let terminate = false;
  let highestForceNode = undefined;
  let highestDeltaPosNodeIndex = -1;
  let highestDeltaPosConstrained = 0;
  let currentIndex = -1;
  const nodeGroupRange = [
    Math.min(...nodeGroups.map((d) => d.startPosition)),
    Math.max(...nodeGroups.map((d) => d.endPosition)),
  ];
  let maxNodeGroupSpread = 0;

  if (maxNodeSpread === undefined) {
    const sequenceIds = new Set(nodeGroups.map(d => d.sequenceId));
    sequenceIds.forEach(sequenceId => {
      const elements = nodeGroups.filter(d => d.sequenceId === sequenceId);
      const start = Math.min(...elements.map((d) => d.startPosition));
      const end = Math.max(...elements.map((d) => d.endPosition));
      const spread = end - start;
      if (spread > maxNodeGroupSpread) {
        maxNodeGroupSpread = spread;
      }
    });
  }
  else { maxNodeGroupSpread = maxNodeSpread; }


  // find node that moves the most out of a random sample of 20 nodes
  for (const _ of Array(20).keys()) {
    const randomIndex = Math.floor(Math.random() * nodeGroups.length);
    const group = nodeGroups[randomIndex];
    // currentIndex = currentIndex + 1;
    currentIndex = randomIndex;
    // calculate direct forces
    const connectedXNodes = findNeighbourNodes(group, nodeGroups);
    const connectionsYSet = new Set(group.connectionsY);
    const connectedYNodes = nodeGroups.filter(d => connectionsYSet.has(d.id));

    let [force, _] = evaluateForces(
      group,
      connectedXNodes,
      connectedYNodes,
      heat,
      springTuning,
      excludedHomologyGroup,
      false
    );

    const maxDepth = 10;
    // calculate forces through other blocks "touching" (only maxDepth n of blocks though)
    const [forceFromLeft, forceFromRight] = findNormalForces(
      group,
      nodeGroups,
      springTuning,
      touchingDistance,
      maxDepth
    );
    force = force + forceFromLeft + forceFromRight;

    // calculate new position
    const deltaPos = force * group.localTempScaling * heat / 1000;
    const deltaPosConstrained: number = applyOrderConstraint(
      group,
      connectedXNodes,
      deltaPos,
      heat,
      touchingDistance
    );

    if (abs(deltaPosConstrained) < abs(highestDeltaPosConstrained)) {
      continue;
    }
    highestDeltaPosConstrained = deltaPosConstrained;
    highestDeltaPosNodeIndex = currentIndex;
  }
  if (highestDeltaPosNodeIndex === -1) {
    terminate = true;
    console.log('terminating because no movement, heat: ', heat);
    return [nodeGroups, terminate];
  }
  const group = nodeGroups[highestDeltaPosNodeIndex];

  // calculate new position
  const deltaPosConstrained: number = highestDeltaPosConstrained;
  const newPositionConstrained = group.startPosition + deltaPosConstrained;
  group.startPosition = newPositionConstrained;

  // local temperature changes to reduce oscilations (Frick et al.)
  if (Math.sign(group.lastMove) !== Math.sign(deltaPosConstrained)) {
    group.localTempScaling = group.localTempScaling * 0.5;
  } else {
    group.localTempScaling = group.localTempScaling * 1.5;
  }

  // replace old node
  highestForceNode = new GraphNodeGroup(
    group.nodes,
    group.originalRange,
    group.id,
    group.connectionsX,
    group.connectionsY,
    deltaPosConstrained,
    group.localTempScaling
  );
  if (highestForceNode !== undefined) {
    nodeGroups.splice(highestDeltaPosNodeIndex, 1, highestForceNode);
  }
  let newNodes = nodeGroups; // enforceMinimumDistance(nodeGroups, touchingDistance)

  // check for order changes
  checkNodeOrder(newNodes);
  // check termination criteria
  if (
    (Math.abs(highestDeltaPosConstrained) < 10
      // || Math.abs(highestDeltaPosConstrained) / maxNodeGroupSpread < 0.0001
    ) && highestDeltaPosConstrained !== 0
  ) {
    console.log(
      'terminating highest delta pos too low.',
      'heat: ',
      heat,
      'highest delta pos: ',
      highestDeltaPosConstrained,
      'max gene spread: ',
      maxNodeGroupSpread
    ),
      terminate = true;
  }
  if (heat < 1) {
    console.log(
      'terminating heat too low.',
      'heat: ',
      heat,
      'highest delta pos: ',
      highestDeltaPosConstrained
    ),
      terminate = true;
  }

  newNodes = enforceMinimumDistance(newNodes, touchingDistance);
  return [newNodes, terminate];
};
