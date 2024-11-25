import type { GraphNode } from "./springSimulationUtils";

export const crossDetection = (nodes: GraphNode[], referenceSequenceId?: string) => {
    const uniqueSequences: string[] = [];
    nodes.map(d => d.sequenceId).forEach(d => {
        if (uniqueSequences.includes(d)) { return; }
        uniqueSequences.push(d);
    });
    const referenceId = referenceSequenceId ?? uniqueSequences[0];
    const referenceSequence = nodes.filter(d => d.sequenceId === referenceId);
    const referenceOrder = referenceSequence.map(d => d.homologyGroup);
    let previousHomologyGroup = '';
    const filteredReferenceOrder = referenceOrder.filter(hg => {
        const remove = hg === previousHomologyGroup;
        previousHomologyGroup = hg;
        return !remove;
    });
    const crosingHomologyGroups: string[] = [];

    uniqueSequences.forEach(sequence => {
        const currentSequenceOrder = nodes.filter(d => d.sequenceId === sequence).map(d => d.homologyGroup);
        let previousHomologyGroup = '';
        const filteredCurrentOrder = currentSequenceOrder.filter(hg => {
            const remove = hg === previousHomologyGroup;
            previousHomologyGroup = hg;
            return !remove;
        });

        // how define order in a good way? what comes before and after? 
        const orderChanges = compareOrder(filteredCurrentOrder, filteredReferenceOrder);
        crosingHomologyGroups.push(...orderChanges);
    });
    return crosingHomologyGroups;
};

const compareOrder = (currentSequence: string[], reference: string[]) => {
    const homologyGroupsWithOrderChanges: string[] = [];

    currentSequence.forEach((gene, currentIndex) => {
        let sameOrderExistsInReference = false;
        reference.forEach((referencePosition, i) => {
            if (referencePosition !== gene) { return; }
            const referenceIndex = i;
            if (orderIsTheSame(currentSequence, reference, currentIndex, referenceIndex)) { sameOrderExistsInReference = true; }
        });
        if (!sameOrderExistsInReference) {
            homologyGroupsWithOrderChanges.push(currentSequence[currentIndex]);
            homologyGroupsWithOrderChanges.push(currentSequence[currentIndex + 1]);
        }
    });
    return homologyGroupsWithOrderChanges;
};

const orderIsTheSame = (current: string[], reference: string[], currentIndex: number, referenceIndex: number) => {
    if (current[currentIndex + 1] !== reference[referenceIndex + 1]) { console.log('not the same'); return false; }
    return true;
}

