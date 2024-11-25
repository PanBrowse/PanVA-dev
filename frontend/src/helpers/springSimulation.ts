import type { Gene, GroupInfo, SequenceInfo, SequenceMetrics } from '@/types';

import {
  applyMinimumdistanceOnSequence,
  createNodeGroups,
  enforceMinimumDistance,
  genesToNodes,
  GraphNode,
  GraphNodeGroup,
  type SpringTuningParameters,
  updateHighStressNodeGroup,
} from './springSimulationUtils';

export const runSpringSimulation = (
  genes: Gene[],
  sequences: SequenceInfo[],
  fromHeat: number = 1000,
  toHeat: number = 10,
  springTuning: SpringTuningParameters,
  initializeOnHomologygroup?: number | boolean,
) => {
  // simulates forces applied to all nodes in the graph
  let heat = fromHeat;
  let nodeGroups: GraphNodeGroup[] = [];
  const nodes: GraphNode[] = genesToNodes(genes);
  const excludedHomologyGroup = 0; // 232290464
  const touchingDistance = springTuning.minimumDistance;

  // initalize with centering on a specific homologygroup
  const anchorHomologyGroup = initializeOnHomologygroup;
  let anchor = 0;
  if (initializeOnHomologygroup !== false) {
    sequences.forEach((sequence) => {
      const sequenceMembers = nodes.filter((d) => d.sequenceId === sequence.uid);
      const centerOfGravity = sequenceMembers.map(d => d.startPosition).reduce((partialSum, a) => partialSum + a, 0) / sequenceMembers.length;

      const anchorElement = sequenceMembers.find(
        (d) => d.homologyGroup === anchorHomologyGroup
      );

      if (anchorElement === undefined) {
        anchor = centerOfGravity;
      } else {
        anchor = anchorElement.startPosition;
      }
      sequenceMembers.forEach((gene) => {
        gene.startPosition = gene.startPosition - anchor;
      });
    });
  }

  // Form grous of overlappiung nodes
  nodeGroups = createNodeGroups(nodes);
  nodeGroups = enforceMinimumDistance(nodeGroups, springTuning.minimumDistance);
  const startTime = Date.now();
  // main loop
  let terminate = false;
  let nIterations = 0;
  const largestStep = 0;
  let currentHeatNIterations = 0;
  let terminateCount = 0;

  const maxTerminateCount = 3;
  const maxTime = 10000;

  let maxGeneDistance = 0;
  const sequenceIds = new Set(nodeGroups.map(d => d.sequenceId));
  sequenceIds.forEach(sequenceId => {
    const elements = nodeGroups.filter(d => d.sequenceId === sequenceId);
    const start = Math.min(...elements.map((d) => d.startPosition));
    const end = Math.max(...elements.map((d) => d.endPosition));
    const spread = end - start;
    if (spread > maxGeneDistance) {
      maxGeneDistance = spread;
    }
  });

  while (true) {
    ;[nodeGroups, terminate] = updateHighStressNodeGroup(
      nodeGroups,
      heat,
      springTuning,
      undefined,
      touchingDistance,
      maxGeneDistance
    );
    terminateCount = terminate ? terminateCount + 1 : terminateCount;
    nIterations = nIterations + 1;
    currentHeatNIterations = currentHeatNIterations + 1;
    // repeat calculations for the same heat a few times (Davidson and Harel)
    if (currentHeatNIterations > 20) {
      heat = heat * 0.99;
      currentHeatNIterations = 0;

      //recalculate gene distances
      maxGeneDistance = 0;
      // const sequenceIds = new Set(nodeGroups.map(d => d.sequenceId));
      sequenceIds.forEach(sequenceId => {
        const elements = nodeGroups.filter(d => d.sequenceId === sequenceId);
        const start = Math.min(...elements.map((d) => d.startPosition));
        const end = Math.max(...elements.map((d) => d.endPosition));
        const spread = end - start;
        if (spread > maxGeneDistance) {
          maxGeneDistance = spread;
        }
      });
    }
    if (
      terminateCount >= maxTerminateCount ||
      (heat <= toHeat) ||
      Date.now() - startTime > maxTime
    ) {

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
      console.log('end heat:', heat);
      console.log(nIterations, 'iterations in simulation');
      const answer = [
        nodeGroups.flatMap((nodeGroup) => nodeGroup.nodes),
        nodeGroups,
      ] as [GraphNode[], GraphNodeGroup[]];
      return answer;
    }
  }
};
